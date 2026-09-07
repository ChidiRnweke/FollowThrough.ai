import {
	authoritativeWriteResource,
	unresolvedWrite,
	nextWrite,
	type WriteBaseResolution,
	type OutboxEntry,
	type WriteDraft,
	type WriteReceipt
} from '$lib/models/outbox';
import type { OutboxRepository, OutboxTransport } from './outbox-contracts';

export interface AccountWriterLock {
	run<T>(accountId: string, work: () => Promise<T>): Promise<T>;
}
export type SubmissionResult =
	{ kind: 'idle' | 'complete' | 'offline' | 'stopped' } | { kind: 'failure'; message: string };
export interface MutationQueueDependencies<C, T> {
	repository: OutboxRepository<C, T>;
	transport: OutboxTransport<C, T>;
	writerLock: AccountWriterLock;
	resolveBase(key: string, value: T, local: T | null): Promise<WriteBaseResolution<T>>;
	received(key: string, resource: WriteReceipt<T>['resource']): Promise<void>;
}

/** Submissions are serialized per account; the durable queue owns ordering and recovery. */
export class MutationQueue<C, T> {
	private entries: readonly OutboxEntry<C, T>[] = [];
	private readonly listeners = new Set<() => void>();
	private flushing: Promise<SubmissionResult> | null = null;
	private online = true;
	private stopped = false;
	private result: SubmissionResult = { kind: 'idle' };
	constructor(
		readonly accountId: string,
		private readonly dependencies: MutationQueueDependencies<C, T>
	) {}
	get pending(): readonly OutboxEntry<C, T>[] {
		return this.entries;
	}
	get status(): SubmissionResult {
		return this.result;
	}
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	setOnline(online: boolean): void {
		this.online = online;
		this.notify();
	}
	stop(): void {
		this.stopped = true;
		this.entries = [];
		this.result = { kind: 'stopped' };
		this.notify();
	}
	async reload(): Promise<void> {
		const entries = await this.dependencies.repository.list(this.accountId);
		if (this.stopped) return;
		this.entries = entries;
		this.notify();
	}
	async append(draft: WriteDraft<C, T>): Promise<string> {
		if (this.stopped) throw new Error('This account is no longer active');
		const id = await this.dependencies.repository.append(this.accountId, draft);
		await this.reload();
		return id;
	}
	async keepLocal(operationId: string): Promise<string> {
		if (this.stopped) throw new Error('This account is no longer active');
		const replacementId = crypto.randomUUID();
		await this.dependencies.repository.keepLocal(this.accountId, operationId, replacementId);
		await this.reload();
		return replacementId;
	}
	async discard(operationIds: readonly string[]): Promise<void> {
		if (this.stopped) throw new Error('This account is no longer active');
		await this.dependencies.repository.discard(this.accountId, operationIds);
		await this.reload();
	}

	flush(): Promise<SubmissionResult> {
		this.flushing ??= this.submit().finally(() => {
			this.flushing = null;
		});
		return this.flushing;
	}
	private async submit(): Promise<SubmissionResult> {
		try {
			if (this.stopped) return { kind: 'stopped' };
			if (!this.online) return { kind: 'offline' };
			const result = await this.dependencies.writerLock.run(
				this.accountId,
				async (): Promise<SubmissionResult> => {
					if (this.stopped) return { kind: 'stopped' };
					if (!this.online) return { kind: 'offline' };
					await this.dependencies.repository.recover(this.accountId);
					while (!this.stopped && this.online) {
						const unresolved = unresolvedWrite(
							await this.dependencies.repository.list(this.accountId)
						);
						if (unresolved?.intent.base) {
							const resolution = await this.dependencies.resolveBase(
								unresolved.intent.key,
								unresolved.intent.base.value,
								unresolved.intent.local
							);
							await this.dependencies.repository.resolveBase(
								this.accountId,
								unresolved.intent.operationId,
								resolution
							);
							const resource =
								resolution.kind === 'matched'
									? { kind: 'found' as const, snapshot: resolution.snapshot }
									: resolution.remote;
							if (resource.kind !== 'unavailable' && !this.stopped)
								await this.dependencies.received(unresolved.intent.key, resource);
							await this.reload();
							continue;
						}
						const sent = await this.dependencies.repository.take(this.accountId);
						await this.reload();
						if (!sent) {
							if (nextWrite(this.entries) || unresolvedWrite(this.entries)) continue;
							return { kind: 'complete' };
						}
						if (this.stopped) return { kind: 'stopped' };
						if (!this.online) return { kind: 'offline' };
						// Once taken, the input remains immutable even if the request's outcome is lost.
						try {
							const outcome = await this.dependencies.transport.send({
								operationId: sent.intent.operationId,
								baseEtag: sent.intent.base?.etag ?? null,
								command: sent.intent.command
							});
							await this.dependencies.repository.settle(this.accountId, sent, outcome);
							const resource = authoritativeWriteResource(outcome);
							if (resource && !this.stopped)
								await this.dependencies.received(sent.intent.key, resource);
						} catch (error) {
							const message = error instanceof Error ? error.message : 'Submission failed';
							await this.dependencies.repository.retry(
								this.accountId,
								sent.intent.operationId,
								message
							);
							await this.reload();
							return { kind: 'failure', message };
						}
						await this.reload();
					}
					return this.stopped ? { kind: 'stopped' } : { kind: 'offline' };
				}
			);
			if (!this.stopped) {
				this.result = result;
				this.notify();
			}
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Local write storage failed';
			if (!this.stopped) {
				this.result = { kind: 'failure', message };
				this.notify();
			}
			return { kind: 'failure', message };
		}
	}
	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}

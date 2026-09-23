import { WorkspaceSyncRuntime } from './workspace-runtime';
import type { SynchronizationResult } from './contracts';
import type { SyncScheduler } from './scheduler';
import {
	type OutboxEntry,
	type WriteDraft,
	type WriteReceipt,
	type WriteOutcome
} from '$lib/models/outbox';
import { dependentWrites, nextWrite } from '$lib/services/sync/state';
import type { OutboxProjection, OutboxRepository, OutboxTransport } from './outbox-contracts';
import { OutboxAccountChangedError } from './outbox-contracts';

export interface AccountWriterLock {
	tryRun<T>(
		accountId: string,
		work: () => Promise<T>
	): Promise<{ kind: 'acquired'; value: T } | { kind: 'busy' }>;
	run<T>(accountId: string, work: () => Promise<T>): Promise<T>;
}
export type SubmissionResult = SynchronizationResult | { kind: 'waiting' };
export interface MutationQueueDependencies<C, T> {
	scheduler: SyncScheduler;
	repository: OutboxRepository<C, T>;
	transport: OutboxTransport<C, T>;
	writerLock: AccountWriterLock;
	pull(): Promise<SynchronizationResult>;
}

/** Submissions are serialized per account; the durable queue owns ordering and recovery. */
export class MutationQueue<C, T> {
	private entries: readonly OutboxEntry<C, T>[] = [];
	private reloadGeneration = 0;
	private readonly receipts = new Map<string, WriteReceipt<T>>();
	private readonly listeners = new Set<() => void>();
	readonly runtime: WorkspaceSyncRuntime;
	private get online() {
		return this.runtime.online;
	}
	private get stopped() {
		return this.runtime.stopped;
	}
	constructor(
		readonly accountId: string,
		private readonly dependencies: MutationQueueDependencies<C, T>
	) {
		this.runtime = new WorkspaceSyncRuntime({
			scheduler: dependencies.scheduler,
			pull: dependencies.pull,
			writes: () => this.submit(),
			failed: () => this.notify()
		});
	}
	get pending(): readonly OutboxEntry<C, T>[] {
		return this.entries;
	}
	acknowledged(key: string, operationId: string): boolean {
		return this.receipts.get(key)?.operationId === operationId;
	}
	get status(): SubmissionResult {
		return this.runtime.writeStatus;
	}
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	setOnline(online: boolean): void {
		this.runtime.setOnline(online);
		this.notify();
	}
	stop(): void {
		this.runtime.stop();
		this.entries = [];
		this.receipts.clear();
		this.notify();
	}
	async reload(): Promise<void> {
		const generation = ++this.reloadGeneration;
		const state = await this.dependencies.repository.snapshot(this.accountId);
		if (generation === this.reloadGeneration) this.applyStored(state);
	}
	applyStored(state: OutboxProjection<C, T>, notify = true): void {
		if (this.stopped) return;
		this.reloadGeneration++;
		const retryable = new Set(
			state.entries
				.filter(
					(entry) =>
						entry.delivery.kind === 'retry' ||
						entry.delivery.kind === 'queued' ||
						entry.delivery.kind === 'sending'
				)
				.map((entry) => entry.intent.operationId)
		);
		this.runtime.retainWriteRetries(retryable);
		this.entries = state.entries;
		this.receipts.clear();
		for (const [key, receipt] of state.receipts) this.receipts.set(key, receipt);
		if (notify) this.notify();
	}

	async append(draft: WriteDraft<C, T>): Promise<string> {
		if (this.stopped) throw new Error('This account is no longer active');
		const id = await this.dependencies.repository.append(this.accountId, draft);
		await this.reload();
		return id;
	}
	async refreshConflict(operationId: string): Promise<void> {
		if (this.stopped || !this.online)
			throw new Error('Reconnect to read the current server version');
		const recovery = this.dependencies.transport.recovery;
		if (!recovery) throw new Error('Conflict recovery is unavailable');
		await this.reload();
		const entry = this.entries.find((entry) => entry.intent.operationId === operationId);
		if (!entry || entry.delivery.kind !== 'conflict')
			throw new Error('This change no longer needs conflict review');
		const remote = await recovery.observe(entry.intent.key);
		await this.dependencies.repository.resolveBase(this.accountId, operationId, {
			kind: 'conflict',
			remote
		});
		await this.reload();
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
		await this.dependencies.writerLock.run(this.accountId, async () => {
			await this.dependencies.repository.recover(this.accountId);
			const all = await this.dependencies.repository.list(this.accountId);
			const selected = all.filter((entry) => operationIds.includes(entry.intent.operationId));
			if (
				selected.some((entry) =>
					dependentWrites(all, entry.intent.operationId).some(
						(child) => !operationIds.includes(child.intent.operationId)
					)
				)
			)
				throw new Error('Review dependent edits before discarding their base');
			if (selected.length !== operationIds.length)
				throw new Error('The selected local edits changed; review them again');
			for (const entry of selected) {
				if (entry.delivery.kind !== 'retry') continue;
				const recovery = this.dependencies.transport.recovery;
				if (!this.online || !recovery)
					throw new Error('Reconnect to confirm the last send before discarding');
				const outcome = await recovery.cancel({
					operationId: entry.intent.operationId,
					baseEtag: entry.intent.base?.etag ?? null,
					command: entry.intent.command
				});
				await this.dependencies.repository.settle(
					this.accountId,
					entry,
					outcome.kind === 'cancelled'
						? { kind: 'rejected', message: 'Cancelled before application' }
						: outcome
				);
				if ((outcome.kind === 'applied' || outcome.kind === 'proven') && !this.stopped)
					this.runtime.committed();
			}
			const remaining = await this.dependencies.repository.list(this.accountId);
			await this.dependencies.repository.discard(
				this.accountId,
				operationIds.filter((id) => remaining.some((entry) => entry.intent.operationId === id))
			);
		});
		await this.reload();
	}

	flush(force = false): Promise<SubmissionResult> {
		return this.runtime.flushWrites(force);
	}
	retryNow(): void {
		this.runtime.retryNow();
	}
	private async submit(): Promise<SubmissionResult> {
		if (this.stopped) return { kind: 'stopped' };
		await this.reload();
		if (this.stopped) return { kind: 'stopped' };
		if (!this.online) return { kind: 'offline' };
		const ownership = await this.dependencies.writerLock.tryRun(
			this.accountId,
			async (): Promise<SubmissionResult> => {
				if (this.stopped) return { kind: 'stopped' };
				if (!this.online) return { kind: 'offline' };
				await this.dependencies.repository.recover(this.accountId);
				const excluded = new Set(this.runtime.excludedWrites());
				let failure: SubmissionResult = { kind: 'complete' };
				while (!this.stopped && this.online) {
					const sent = await this.dependencies.repository.take(this.accountId, excluded);
					await this.reload();
					if (!sent) {
						if (nextWrite(this.entries, excluded)) continue;
						const deferred = this.entries.find((entry) => entry.delivery.kind === 'retry');
						return deferred?.delivery.kind === 'retry'
							? { kind: 'failure', message: deferred.delivery.message }
							: failure;
					}
					if (this.stopped) return { kind: 'stopped' };
					if (!this.online) return { kind: 'offline' };
					// Once taken, the input remains immutable even if the request's outcome is lost.
					const response = await this.send(sent);
					if (response.kind === 'failure') {
						await this.dependencies.repository.retry(
							this.accountId,
							sent.intent.operationId,
							response.message
						);
						await this.reload();
						this.runtime.deferWrite(sent.intent.operationId);
						excluded.add(sent.intent.operationId);
						failure = { kind: 'failure', message: response.message };
						if (response.accountChanged) {
							this.runtime.setOnline(false);
							return failure;
						}
						continue;
					}
					const outcome = response.outcome;
					await this.dependencies.repository.settle(this.accountId, sent, outcome);
					this.runtime.clearWriteRetry(sent.intent.operationId);
					if ((outcome.kind === 'applied' || outcome.kind === 'proven') && !this.stopped)
						this.runtime.committed();
					await this.reload();
				}
				return this.stopped ? { kind: 'stopped' } : { kind: 'offline' };
			}
		);
		return ownership.kind === 'busy' ? { kind: 'waiting' } : ownership.value;
	}

	private async send(
		sent: OutboxEntry<C, T>
	): Promise<
		| { kind: 'response'; outcome: WriteOutcome<T> }
		| { kind: 'failure'; message: string; accountChanged: boolean }
	> {
		try {
			const outcome = await this.dependencies.transport.send({
				operationId: sent.intent.operationId,
				baseEtag: sent.intent.base?.etag ?? null,
				command: sent.intent.command
			});
			return { kind: 'response', outcome };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Submission failed',
				accountChanged: error instanceof OutboxAccountChangedError
			};
		}
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}

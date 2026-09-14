import type { SyncScheduler } from './scheduler';
import {
	dependentWrites,
	unresolvedWrite,
	nextWrite,
	type WriteBaseResolution,
	type OutboxEntry,
	type WriteDraft,
	type WriteReceipt,
	type WriteOutcome
} from '$lib/models/outbox';
import type { OutboxProjection, OutboxRepository, OutboxTransport } from './outbox-contracts';
import { OutboxAccountChangedError } from './outbox-contracts';

export interface AccountWriterLock {
	tryRun<T>(
		accountId: string,
		work: () => Promise<T>
	): Promise<{ kind: 'acquired'; value: T } | { kind: 'busy' }>;
	run<T>(accountId: string, work: () => Promise<T>): Promise<T>;
}
export type SubmissionResult =
	| { kind: 'idle' | 'complete' | 'offline' | 'stopped' | 'waiting' }
	| { kind: 'failure'; message: string };
export interface MutationQueueDependencies<C, T> {
	scheduler: SyncScheduler;
	repository: OutboxRepository<C, T>;
	transport: OutboxTransport<C, T>;
	writerLock: AccountWriterLock;
	resolveBase(key: string, value: T, local: T | null): Promise<WriteBaseResolution<T>>;
	committed(): void;
}

/** Submissions are serialized per account; the durable queue owns ordering and recovery. */
export class MutationQueue<C, T> {
	private entries: readonly OutboxEntry<C, T>[] = [];
	private reloadGeneration = 0;
	private readonly receipts = new Map<string, WriteReceipt<T>>();
	private readonly listeners = new Set<() => void>();
	private flushing: Promise<SubmissionResult> | null = null;
	private online = true;
	private stopped = false;
	private result: SubmissionResult = { kind: 'idle' };
	private cancelWake: (() => void) | null = null;
	private readonly retryAfter = new Map<string, { attempts: number; at: number }>();
	constructor(
		readonly accountId: string,
		private readonly dependencies: MutationQueueDependencies<C, T>
	) {}
	get pending(): readonly OutboxEntry<C, T>[] {
		return this.entries;
	}
	acknowledged(key: string, operationId: string): boolean {
		return this.receipts.get(key)?.operationId === operationId;
	}
	get status(): SubmissionResult {
		return this.result;
	}
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	useScheduler(scheduler: SyncScheduler): void {
		this.cancelWake?.();
		this.cancelWake = null;
		this.dependencies.scheduler = scheduler;
		this.scheduleRetry();
	}

	setOnline(online: boolean): void {
		this.online = online;
		this.scheduleRetry();
		this.notify();
	}
	stop(): void {
		this.stopped = true;
		this.cancelWake?.();
		this.cancelWake = null;
		this.entries = [];
		this.receipts.clear();
		this.result = { kind: 'stopped' };
		this.notify();
	}
	async settled(): Promise<void> {
		await this.flushing;
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
				.filter((entry) => entry.delivery.kind === 'retry' || entry.delivery.kind === 'queued')
				.map((entry) => entry.intent.operationId)
		);
		for (const id of this.retryAfter.keys())
			if (!retryable.has(id) && id !== 'acknowledgements' && id !== 'writer' && id !== 'storage')
				this.retryAfter.delete(id);
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
				if (outcome.kind === 'applied' && !this.stopped) this.dependencies.committed();
			}
			const remaining = await this.dependencies.repository.list(this.accountId);
			await this.dependencies.repository.discard(
				this.accountId,
				operationIds.filter((id) => remaining.some((entry) => entry.intent.operationId === id))
			);
		});
		await this.reload();
	}
	private async acknowledgePending(): Promise<SubmissionResult> {
		const recovery = this.dependencies.transport.recovery;
		if (!recovery) return { kind: 'complete' };
		if ((this.retryAfter.get('acknowledgements')?.at ?? 0) > this.dependencies.scheduler.now())
			return { kind: 'waiting' };
		try {
			for (const operationId of await this.dependencies.repository.pendingAcknowledgements(
				this.accountId
			)) {
				if (this.stopped || !this.online) return { kind: 'stopped' };
				await recovery.acknowledge(operationId);
				await this.dependencies.repository.acknowledged(this.accountId, operationId);
			}
			this.retryAfter.delete('acknowledgements');
			return { kind: 'complete' };
		} catch (error) {
			this.deferRetry('acknowledgements');
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Receipt acknowledgement failed'
			};
		}
	}

	flush(force = false): Promise<SubmissionResult> {
		if (force) this.retryNow();
		this.flushing ??= this.submit().finally(() => {
			this.flushing = null;
			this.scheduleRetry();
		});
		return this.flushing;
	}
	retryNow(): void {
		for (const retry of this.retryAfter.values()) retry.at = 0;
	}
	private async submit(): Promise<SubmissionResult> {
		try {
			if (this.stopped) return { kind: 'stopped' };
			await this.reload();
			if (this.stopped) return { kind: 'stopped' };
			if (!this.online) return { kind: 'offline' };
			const ownership = await this.dependencies.writerLock.tryRun(
				this.accountId,
				async (): Promise<SubmissionResult> => {
					if (this.stopped) return { kind: 'stopped' };
					if (!this.online) return { kind: 'offline' };
					this.retryAfter.delete('writer');
					this.retryAfter.delete('storage');
					await this.dependencies.repository.recover(this.accountId);
					const excluded = new Set(
						[...this.retryAfter]
							.filter(([, retry]) => retry.at > this.dependencies.scheduler.now())
							.map(([id]) => id)
					);
					let failure: SubmissionResult = await this.acknowledgePending();
					while (!this.stopped && this.online) {
						const unresolved = unresolvedWrite(
							await this.dependencies.repository.list(this.accountId),
							excluded
						);
						if (unresolved?.intent.base) {
							const resolution = await this.resolveImportedBase(
								unresolved.intent.key,
								unresolved.intent.base.value,
								unresolved.intent.local
							);
							if (resolution.kind === 'failure') {
								excluded.add(unresolved.intent.operationId);
								this.deferRetry(unresolved.intent.operationId);
								failure = resolution;
								continue;
							}
							await this.dependencies.repository.resolveBase(
								this.accountId,
								unresolved.intent.operationId,
								resolution
							);
							this.retryAfter.delete(unresolved.intent.operationId);
							await this.reload();
							continue;
						}
						const sent = await this.dependencies.repository.take(this.accountId, excluded);
						await this.reload();
						if (!sent) {
							if (nextWrite(this.entries, excluded) || unresolvedWrite(this.entries, excluded))
								continue;
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
							this.deferRetry(sent.intent.operationId);
							excluded.add(sent.intent.operationId);
							failure = { kind: 'failure', message: response.message };
							if (response.accountChanged) {
								this.online = false;
								return failure;
							}
							continue;
						}
						const outcome = response.outcome;
						await this.dependencies.repository.settle(this.accountId, sent, outcome);
						this.retryAfter.delete(sent.intent.operationId);
						if (outcome.kind === 'applied' && !this.stopped) this.dependencies.committed();
						await this.reload();
						const acknowledged = await this.acknowledgePending();
						if (acknowledged.kind === 'failure') failure = acknowledged;
					}
					return this.stopped ? { kind: 'stopped' } : { kind: 'offline' };
				}
			);
			if (ownership.kind === 'busy') this.deferRetry('writer');
			const result: SubmissionResult =
				ownership.kind === 'busy' ? { kind: 'waiting' } : ownership.value;
			if (!this.stopped) {
				this.result = result;
				this.notify();
			}
			return result;
		} catch (error) {
			this.deferRetry('storage');
			for (const [id, retry] of this.retryAfter) {
				if (retry.at <= this.dependencies.scheduler.now()) this.deferRetry(id);
			}
			const message = error instanceof Error ? error.message : 'Local write storage failed';
			if (!this.stopped) {
				this.result = { kind: 'failure', message };
				this.notify();
			}
			return { kind: 'failure', message };
		}
	}
	private scheduleRetry(): void {
		this.cancelWake?.();
		this.cancelWake = null;
		if (this.stopped || !this.online || !this.retryAfter.size) return;
		const deadline = Math.min(...[...this.retryAfter.values()].map((retry) => retry.at));
		this.cancelWake = this.dependencies.scheduler.schedule(deadline, async () => {
			this.cancelWake = null;
			await this.flush();
		});
	}
	private deferRetry(operationId: string): void {
		const attempts = (this.retryAfter.get(operationId)?.attempts ?? 0) + 1;
		this.retryAfter.set(operationId, {
			attempts,
			at:
				this.dependencies.scheduler.now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts - 1, 6))
		});
	}
	private async resolveImportedBase(
		key: string,
		base: T,
		local: T | null
	): Promise<WriteBaseResolution<T> | { kind: 'failure'; message: string }> {
		try {
			return await this.dependencies.resolveBase(key, base, local);
		} catch (error) {
			return {
				kind: 'failure',
				message:
					error instanceof Error
						? error.message
						: 'The original server version could not be checked'
			};
		}
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

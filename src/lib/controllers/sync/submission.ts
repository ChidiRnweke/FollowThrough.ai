import type { IOutboxEditingService, IOutboxDeliveryService } from '$lib/services/sync/state';
import type { WorkspaceSynchronizationController } from '$lib/controllers/sync/execution';
import type { SynchronizationResult, SyncEtag, SyncScheduler } from '$lib/models/sync';
import { type OutboxEntry, type WriteDraft, type WriteOutcome } from '$lib/models/outbox';

import type {
	OutboxProjection,
	WriteReceipt,
	WriteBaseResolution,
	ServerResource,
	WriteRecovery
} from '$lib/models/outbox';
import type { MutationQueueStore } from '$lib/stores/sync/submission';
import { OutboxAccountChangedError } from '$lib/errors';

export interface DurableWriteController<C, T> {
	snapshot(accountId: string): Promise<OutboxProjection<C, T>>;
	receipt(accountId: string, key: string): Promise<WriteReceipt<T> | null>;
	list(accountId: string): Promise<readonly OutboxEntry<C, T>[]>;
	append(accountId: string, draft: WriteDraft<C, T>): Promise<string>;
	resolveBase(
		accountId: string,
		operationId: string,
		resolution: WriteBaseResolution<T>
	): Promise<void>;
	keepLocal(accountId: string, operationId: string, replacementId: string): Promise<void>;
	discard(accountId: string, operationIds: readonly string[]): Promise<void>;
	take(accountId: string, excluded?: ReadonlySet<string>): Promise<OutboxEntry<C, T> | null>;
	retry(accountId: string, operationId: string, message: string): Promise<void>;
	/** Call only after acquiring the account's exclusive writer lock. */
	recover(accountId: string): Promise<void>;
	/** Queue acknowledgement and the authoritative cached resource commit atomically. */
	settle(accountId: string, sent: OutboxEntry<C, T>, outcome: WriteOutcome<T>): Promise<void>;
}

export interface OutboxTransport<C, T> {
	readonly recovery?: {
		observe(key: string): Promise<ServerResource<T>>;
		cancel(input: {
			operationId: string;
			baseEtag: SyncEtag | null;
			command: C;
		}): Promise<WriteRecovery<T>>;
	};
	send(input: {
		readonly operationId: string;
		readonly baseEtag: SyncEtag | null;
		readonly command: C;
	}): Promise<WriteOutcome<T>>;
}

export interface AccountWriterLock {
	tryRun<T>(
		accountId: string,
		work: () => Promise<T>
	): Promise<{ kind: 'acquired'; value: T } | { kind: 'busy' }>;
	run<T>(accountId: string, work: () => Promise<T>): Promise<T>;
}
import type { SubmissionResult } from '$lib/models/sync';
export type { SubmissionResult } from '$lib/models/sync';
export interface MutationQueueDependencies<C, T> {
	scheduler: SyncScheduler;
	repository: DurableWriteController<C, T>;
	transport: OutboxTransport<C, T>;
	writerLock: AccountWriterLock;
	pull(): Promise<SynchronizationResult>;
}

/** Submissions are serialized per account; the durable queue owns ordering and recovery. */
export interface MutationQueueController<C, T> {
	readonly accountId: string;
	readonly pending: readonly OutboxEntry<C, T>[];
	readonly status: SubmissionResult;
	reviewDependents(operationId: string): readonly OutboxEntry<C, T>[];
	acknowledged(key: string, operationId: string): boolean;
	subscribe(listener: () => void): () => void;
	setOnline(online: boolean): void;
	stop(): void;
	reload(): Promise<void>;
	applyStored(state: OutboxProjection<C, T>, notify?: boolean): void;
	append(draft: WriteDraft<C, T>): Promise<string>;
	refreshConflict(operationId: string): Promise<void>;
	keepLocal(operationId: string): Promise<string>;
	discard(operationIds: readonly string[]): Promise<void>;
	flush(force?: boolean): Promise<SubmissionResult>;
	retryNow(): void;
}

export interface MutationSubmissionDependencies<C, T> {
	readonly repository: DurableWriteController<C, T>;
	readonly transport: OutboxTransport<C, T>;
	readonly writerLock: AccountWriterLock;
}

export interface SubmissionLane {
	submit(): Promise<SubmissionResult>;
	notify(): void;
}

export class MutationSubmission<C, T> implements MutationQueueController<C, T>, SubmissionLane {
	private get online() {
		return this.execution.online;
	}
	private get stopped() {
		return this.execution.stopped;
	}
	constructor(
		readonly accountId: string,
		private readonly dependencies: MutationSubmissionDependencies<C, T>,
		private readonly state: MutationQueueStore<C, T>,
		private readonly execution: WorkspaceSynchronizationController,
		private readonly editing: IOutboxEditingService,
		private readonly delivery: IOutboxDeliveryService
	) {}

	get pending(): readonly OutboxEntry<C, T>[] {
		return this.state.read().entries;
	}
	reviewDependents(operationId: string): readonly OutboxEntry<C, T>[] {
		return this.editing.dependents(this.pending, operationId);
	}
	acknowledged(key: string, operationId: string): boolean {
		return this.state.read().receipts.get(key)?.operationId === operationId;
	}
	get status(): SubmissionResult {
		return this.execution.writeStatus;
	}
	subscribe(listener: () => void): () => void {
		return this.state.subscribe(listener);
	}
	setOnline(online: boolean): void {
		this.execution.setOnline(online);
		this.notify();
	}
	stop(): void {
		this.execution.stop();
		this.state.clear();
		this.notify();
	}
	async reload(): Promise<void> {
		const generation = this.state.advanceGeneration();
		const state = await this.dependencies.repository.snapshot(this.accountId);
		if (generation === this.state.reloadGeneration) this.applyStored(state);
	}
	applyStored(state: OutboxProjection<C, T>, notify = true): void {
		if (this.stopped) return;

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
		this.execution.retainWriteRetries(retryable);
		this.state.replace(state);
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
		const entry = this.state
			.read()
			.entries.find((entry) => entry.intent.operationId === operationId);
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
					this.editing
						.dependents(all, entry.intent.operationId)
						.some((child) => !operationIds.includes(child.intent.operationId))
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
					this.execution.committed();
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
		return this.execution.flushWrites(force);
	}
	retryNow(): void {
		this.execution.retryNow();
	}
	async submit(): Promise<SubmissionResult> {
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
				const excluded = new Set(this.execution.excludedWrites());
				let failure: SubmissionResult = { kind: 'complete' };
				while (!this.stopped && this.online) {
					const sent = await this.dependencies.repository.take(this.accountId, excluded);
					await this.reload();
					if (!sent) {
						if (this.delivery.next(this.state.read().entries, excluded)) continue;
						const deferred = this.state
							.read()
							.entries.find((entry) => entry.delivery.kind === 'retry');
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
						this.execution.deferWrite(sent.intent.operationId);
						excluded.add(sent.intent.operationId);
						failure = { kind: 'failure', message: response.message };
						if (response.accountChanged) {
							this.execution.setOnline(false);
							return failure;
						}
						continue;
					}
					const outcome = response.outcome;
					await this.dependencies.repository.settle(this.accountId, sent, outcome);
					this.execution.clearWriteRetry(sent.intent.operationId);
					if ((outcome.kind === 'applied' || outcome.kind === 'proven') && !this.stopped)
						this.execution.committed();
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

	notify(): void {
		for (const listener of this.state.listeners()) listener();
	}
}

import {
	type WriteReceipt,
	type WriteBaseResolution,
	type OutboxEntry,
	type WriteDraft,
	type WriteOutcome,
	type WriteRebase
} from '$lib/models/outbox';
import {
	authoritativeWriteResource,
	retryConflictedWrite,
	retainWriteReceipt,
	discardWrites,
	appendWrite,
	beginWrite,
	failWrite,
	nextWrite,
	settleWrite,
	resolveWriteBase,
	rebaseConflictedWrite,
	rebaseDraft
} from '$lib/services/sync/state';
import type {
	WorkspaceLocalProjection,
	WorkspaceLocalRepository
} from '$lib/client/sync/workspace-local-repository';
import { InMemorySyncCache } from './in-memory-sync';
import type { SyncCacheRepository } from '$lib/client/sync/contracts';
import type { AccountWriterLock } from '$lib/client/sync/mutation-queue';

export class InMemoryOutbox<C, T> implements WorkspaceLocalRepository<C, T> {
	private readonly accounts = new Map<string, readonly OutboxEntry<C, T>[]>();
	private sequence = 0;
	private readonly receipts = new Map<string, Map<string, WriteReceipt<T>>>();
	private readonly observers = new Map<
		string,
		Set<(state: WorkspaceLocalProjection<C, T>) => void>
	>();
	readonly projectedCache: SyncCacheRepository<T>;
	constructor(
		private readonly rebase: WriteRebase<T>,
		private readonly cache = new InMemorySyncCache<T>()
	) {
		this.projectedCache = {
			load: async (accountId) => (await this.read(accountId)).cache,
			commit: (accountId, changes) => this.cache.commit(accountId, changes)
		};
	}
	snapshotFailure: string | null = null;
	appendFailure: string | null = null;
	appendFailures = new Map<string, string>();
	async receipt(accountId: string, key: string): Promise<WriteReceipt<T> | null> {
		return this.receipts.get(accountId)?.get(key) ?? null;
	}
	async snapshot(accountId: string) {
		return (await this.read(accountId)).writes;
	}
	async read(accountId: string): Promise<WorkspaceLocalProjection<C, T>> {
		if (this.snapshotFailure) throw new Error(this.snapshotFailure);
		const state = {
			cache: await this.cache.load(accountId),
			writes: {
				entries: this.accounts.get(accountId) ?? [],
				receipts: new Map(this.receipts.get(accountId))
			}
		};
		for (const observer of this.observers.get(accountId) ?? []) observer(state);
		return state;
	}
	observe(accountId: string, changed: (state: WorkspaceLocalProjection<C, T>) => void): () => void {
		const observers = this.observers.get(accountId) ?? new Set();
		observers.add(changed);
		this.observers.set(accountId, observers);
		return () => {
			observers.delete(changed);
		};
	}

	async list(accountId: string): Promise<readonly OutboxEntry<C, T>[]> {
		return this.entries(accountId);
	}
	/** Each transition reads and writes without yielding, like one IndexedDB transaction. */
	private entries(accountId: string): readonly OutboxEntry<C, T>[] {
		return this.accounts.get(accountId) ?? [];
	}
	async append(accountId: string, draft: WriteDraft<C, T>): Promise<string> {
		if (this.appendFailure) throw new Error(this.appendFailure);
		const failure = this.appendFailures.get(draft.key);
		if (failure) throw new Error(failure);
		const entries = this.entries(accountId);
		const receipt = this.receipts.get(accountId)?.get(draft.key) ?? null;
		const next = appendWrite(
			entries,
			rebaseDraft(entries, draft, receipt, this.rebase),
			++this.sequence,
			receipt
		);
		this.accounts.set(accountId, next);
		const appended = next.findLast((entry) => entry.intent.key === draft.key);
		if (!appended) throw new Error('The queued resource was not appended');
		return appended.intent.operationId;
	}
	async resolveBase(
		accountId: string,
		operationId: string,
		resolution: WriteBaseResolution<T>
	): Promise<void> {
		const entries = this.entries(accountId);
		const next = resolveWriteBase(entries, operationId, resolution);
		const original = entries.find((entry) => entry.intent.operationId === operationId);
		const resource = resolution.remote;
		this.accounts.set(accountId, next);
		if (original && resource.kind !== 'unavailable')
			await this.saveResource(accountId, original.intent.key, resource);
	}

	async keepLocal(accountId: string, operationId: string, replacementId: string): Promise<void> {
		this.accounts.set(
			accountId,
			retryConflictedWrite(this.entries(accountId), operationId, replacementId)
		);
	}
	async discard(accountId: string, operationIds: readonly string[]): Promise<void> {
		this.accounts.set(accountId, discardWrites(this.entries(accountId), operationIds));
	}

	async take(
		accountId: string,
		excluded: ReadonlySet<string> = new Set()
	): Promise<OutboxEntry<C, T> | null> {
		const entries = this.entries(accountId);
		const next = nextWrite(entries, excluded);
		if (!next) return null;
		const sent = beginWrite(next);
		this.accounts.set(
			accountId,
			entries.map((entry) => (entry === next ? sent : entry))
		);
		return sent;
	}
	async retry(accountId: string, operationId: string, message: string): Promise<void> {
		this.accounts.set(
			accountId,
			this.entries(accountId).map((entry) =>
				entry.intent.operationId === operationId ? failWrite(entry, message) : entry
			)
		);
	}
	async recover(accountId: string): Promise<void> {
		this.accounts.set(
			accountId,
			this.entries(accountId).map((entry) =>
				failWrite(entry, 'Interrupted submission; checking its receipt')
			)
		);
	}
	async settle(
		accountId: string,
		sent: OutboxEntry<C, T>,
		outcome: WriteOutcome<T>
	): Promise<void> {
		const settled = settleWrite(this.entries(accountId), sent.intent.operationId, outcome);
		const next =
			outcome.kind === 'conflict'
				? rebaseConflictedWrite(settled, sent.intent.operationId, this.rebase)
				: settled;
		const receipts = this.receipts.get(accountId) ?? new Map<string, WriteReceipt<T>>();
		const receipt =
			outcome.kind === 'applied'
				? retainWriteReceipt(receipts.get(sent.intent.key) ?? null, outcome.receipt)
				: null;
		this.accounts.set(accountId, next);
		if (receipt) {
			receipts.set(sent.intent.key, receipt);
			this.receipts.set(accountId, receipts);
		}
		const resource = authoritativeWriteResource(outcome);
		if (resource) await this.saveResource(accountId, sent.intent.key, resource);
	}
	private async saveResource(
		accountId: string,
		key: string,
		resource: WriteReceipt<T>['resource']
	): Promise<void> {
		await this.cache.commit(accountId, {
			put: [
				{
					key,
					entry:
						resource.kind === 'found' ? { kind: 'present', snapshot: resource.snapshot } : resource
				}
			],
			remove: []
		});
	}
}

export class InMemoryAccountWriterLock implements AccountWriterLock {
	private readonly waiting = new Map<string, Promise<void>>();
	async tryRun<T>(
		accountId: string,
		work: () => Promise<T>
	): Promise<{ kind: 'acquired'; value: T } | { kind: 'busy' }> {
		if (this.waiting.has(accountId)) return { kind: 'busy' };
		return { kind: 'acquired', value: await this.run(accountId, work) };
	}
	async run<T>(accountId: string, work: () => Promise<T>): Promise<T> {
		const previous = this.waiting.get(accountId) ?? Promise.resolve();
		const released = Promise.withResolvers<void>();
		this.waiting.set(accountId, released.promise);
		await previous;
		try {
			return await work();
		} finally {
			released.resolve();
			if (this.waiting.get(accountId) === released.promise) this.waiting.delete(accountId);
		}
	}
}

import {
	mergeResourceStates,
	initialCacheGeneration,
	resourceVersion,
	type SyncSnapshot,
	type SyncCursor,
	type SyncPage,
	type ResourceChange
} from '$lib/models/sync';
import type {
	CacheCommit,
	CachedRecord,
	StoredCache,
	SyncCacheRepository,
	SyncReadTransport,
	ObjectRead
} from '$lib/client/sync/contracts';

export class InMemorySyncCache<T> implements SyncCacheRepository<T> {
	private readonly accounts = new Map<string, Map<string, CachedRecord<T>>>();
	private readonly cursors = new Map<string, SyncCursor>();
	private readonly inventories = new Map<string, boolean>();
	private readonly generations = new Map<string, string>();

	recoverInventory(accountId: string): void {
		this.generations.set(accountId, crypto.randomUUID());
		this.cursors.delete(accountId);
		this.inventories.set(accountId, false);
	}
	writeFailure: string | null = null;
	private nextLoad: { started(): void; ready: Promise<void> } | null = null;
	pauseNextLoad(): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.nextLoad = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}

	async load(accountId: string): Promise<StoredCache<T>> {
		const stored = {
			generation: this.generations.get(accountId) ?? initialCacheGeneration,
			inventoryComplete: this.inventories.get(accountId) ?? this.cursors.has(accountId),
			records: [...(this.accounts.get(accountId)?.values() ?? [])],
			cursor: this.cursors.get(accountId) ?? null
		};
		const paused = this.nextLoad;
		this.nextLoad = null;
		if (paused) {
			paused.started();
			await paused.ready;
		}
		return stored;
	}

	async commit(accountId: string, changes: CacheCommit<T>): Promise<void> {
		if (this.writeFailure) throw new Error(this.writeFailure);
		const generation = this.generations.get(accountId) ?? initialCacheGeneration;
		if (changes.generation !== undefined && changes.generation !== generation)
			throw new Error('Workspace storage was recovered in another tab. Retry synchronization.');
		const keys = [
			...changes.put.map((record) => record.key),
			...changes.remove.map((record) => record.key)
		];
		if (new Set(keys).size !== keys.length)
			throw new Error('A cache commit must touch each resource only once');
		const records = this.accounts.get(accountId) ?? new Map<string, CachedRecord<T>>();
		for (const proposed of changes.put) {
			const previous = records.get(proposed.key);
			const record = {
				key: proposed.key,
				entry: previous ? mergeResourceStates(previous.entry, proposed.entry) : proposed.entry
			};
			records.set(record.key, record);
		}
		for (const removal of changes.remove) {
			const previous = records.get(removal.key);
			if (!previous || resourceVersion(previous.entry) === removal.etag) {
				records.delete(removal.key);
			}
		}
		this.accounts.set(accountId, records);
		const cursor = this.cursors.get(accountId);
		if (
			changes.cursor !== undefined &&
			(cursor === undefined || BigInt(changes.cursor) > BigInt(cursor))
		)
			this.cursors.set(accountId, changes.cursor);
		if (changes.inventoryComplete !== undefined)
			this.inventories.set(accountId, changes.inventoryComplete);
	}
}

/** A controllable network connection, with bodies delivered over that connection as evidence. */
export class InMemorySyncTransport<T> implements SyncReadTransport<T> {
	readonly records = new Map<string, SyncSnapshot<T>>();
	readonly deliveredBodies: string[] = [];
	readonly readSnapshots = new Map<string, SyncSnapshot<T>>();
	readBudget = Infinity;
	maxConcurrentReads = Infinity;
	private activeReads = 0;
	pullFailure: string | null = null;
	readFailure: string | null = null;
	pageSize: number | null = null;
	private readonly paused = new Map<string, { start: () => void; ready: Promise<void> }>();

	pause(key: string): { started: Promise<void>; release: () => void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.paused.set(key, { start: started.resolve, ready: ready.promise });
		return { started: started.promise, release: ready.resolve };
	}

	private cursor = 0n;
	private readonly versions = new Map<string, SyncSnapshot<T>['etag']>();
	private readonly changes = new Map<string, { cursor: bigint; change: ResourceChange }>();

	async pull(since: SyncCursor) {
		if (this.pullFailure) throw new Error(this.pullFailure);
		for (const [key, snapshot] of this.records) {
			if (this.versions.get(key) === snapshot.etag) continue;
			this.versions.set(key, snapshot.etag);
			this.changes.set(key, {
				cursor: ++this.cursor,
				change: { kind: 'upsert', key, etag: snapshot.etag }
			});
		}
		for (const [key, etag] of this.versions) {
			if (this.records.has(key)) continue;
			this.versions.delete(key);
			this.changes.set(key, { cursor: ++this.cursor, change: { kind: 'delete', key, etag } });
		}
		const changes = [...this.changes.values()]
			.filter((item) => item.cursor > BigInt(since))
			.sort((a, b) => (a.cursor < b.cursor ? -1 : 1));
		const selected = this.pageSize === null ? changes : changes.slice(0, this.pageSize);
		const hasMore = selected.length < changes.length;
		const records: SyncPage<T>['records'] = selected.map(({ change }) => {
			if (change.kind === 'delete')
				return { key: change.key, resource: { kind: 'deleted', etag: change.etag } };
			const snapshot = this.records.get(change.key);
			if (!snapshot) throw new Error('The journal resource is missing');
			const failure = this.failures.get(change.key);
			if (failure) throw new Error(failure);
			return { key: change.key, resource: { kind: 'found', snapshot } };
		});
		const page = {
			cursor: String(hasMore ? selected.at(-1)!.cursor : this.cursor) as SyncCursor,
			hasMore,
			records
		};
		await this.wait('changes');
		this.deliveredBodies.push(
			...records.filter((row) => row.resource.kind === 'found').map((row) => row.key)
		);
		return page;
	}

	async read(key: string, etag: SyncSnapshot<T>['etag'] | null): Promise<ObjectRead<T>> {
		if (--this.readBudget < 0) throw new Error('Transport capacity exhausted without progress');
		const snapshot = this.readSnapshots.get(key) ?? this.records.get(key);
		if (this.activeReads >= this.maxConcurrentReads) throw new Error('Download capacity exceeded');
		this.activeReads++;
		try {
			await this.wait(key);
		} finally {
			this.activeReads--;
		}
		if (this.readFailure) throw new Error(this.readFailure);
		if (!snapshot) return { kind: 'unavailable' };
		if (snapshot.etag === etag) return { kind: 'unchanged', etag };
		this.deliveredBodies.push(key);
		return { kind: 'found', snapshot };
	}

	readonly failures = new Map<string, string>();
	private async wait(key: string): Promise<void> {
		const paused = this.paused.get(key);
		if (!paused) return;
		this.paused.delete(key);
		paused.start();
		await paused.ready;
	}
}

/** Named batch fixture retained for focused download scenarios. */
export { InMemorySyncTransport as InMemoryBatchSyncTransport };

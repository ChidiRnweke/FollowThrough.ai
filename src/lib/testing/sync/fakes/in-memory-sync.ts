import {
	mergeResourceStates,
	resourceVersion,
	type SyncSnapshot,
	type SyncCursor,
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
	writeFailure: string | null = null;

	async load(accountId: string): Promise<StoredCache<T>> {
		return {
			records: [...(this.accounts.get(accountId)?.values() ?? [])],
			cursor: this.cursors.get(accountId) ?? null
		};
	}

	async commit(accountId: string, changes: CacheCommit<T>): Promise<CacheCommit<T>> {
		if (this.writeFailure) throw new Error(this.writeFailure);
		const records = this.accounts.get(accountId) ?? new Map<string, CachedRecord<T>>();
		const put: CachedRecord<T>[] = [];
		const remove: CacheCommit<T>['remove'][number][] = [];
		for (const proposed of changes.put) {
			const previous = records.get(proposed.key);
			const record = {
				key: proposed.key,
				entry: previous ? mergeResourceStates(previous.entry, proposed.entry) : proposed.entry
			};
			records.set(record.key, record);
			put.push(record);
		}
		for (const removal of changes.remove) {
			const previous = records.get(removal.key);
			if (!previous || resourceVersion(previous.entry) === removal.etag) {
				records.delete(removal.key);
				remove.push(removal);
			} else put.push(previous);
		}
		this.accounts.set(accountId, records);
		const cursor = this.cursors.get(accountId);
		if (
			changes.cursor !== undefined &&
			(cursor === undefined || BigInt(changes.cursor) > BigInt(cursor))
		)
			this.cursors.set(accountId, changes.cursor);
		return { ...changes, put, remove };
	}
}

/** A controllable network connection, with bodies delivered over that connection as evidence. */
export class InMemorySyncTransport<T> implements SyncReadTransport<T> {
	readonly records = new Map<string, SyncSnapshot<T>>();
	readonly deliveredBodies: string[] = [];
	pullFailure: string | null = null;
	readFailure: string | null = null;
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
		const batch = {
			cursor: String(this.cursor) as SyncCursor,
			changes: [...this.changes.values()]
				.filter((item) => item.cursor > BigInt(since))
				.map((item) => item.change)
		};
		await this.wait('changes');
		return batch;
	}

	async read(key: string, etag: SyncSnapshot<T>['etag'] | null): Promise<ObjectRead<T>> {
		const snapshot = this.records.get(key);
		await this.wait(key);
		if (this.readFailure) throw new Error(this.readFailure);
		if (!snapshot) return { kind: 'unavailable' };
		if (snapshot.etag === etag) return { kind: 'unchanged', etag };
		this.deliveredBodies.push(key);
		return { kind: 'found', snapshot };
	}

	private async wait(key: string): Promise<void> {
		const paused = this.paused.get(key);
		if (!paused) return;
		this.paused.delete(key);
		paused.start();
		await paused.ready;
	}
}

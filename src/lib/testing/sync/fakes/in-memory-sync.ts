import type { SyncSnapshot, InventoryEntry } from '$lib/models/sync';
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
	private readonly inventories = new Map<string, readonly InventoryEntry[]>();
	writeFailure: string | null = null;

	async load(accountId: string): Promise<StoredCache<T>> {
		return {
			records: [...(this.accounts.get(accountId)?.values() ?? [])],
			inventory: this.inventories.get(accountId) ?? null
		};
	}

	async commit(accountId: string, changes: CacheCommit<T>): Promise<void> {
		if (this.writeFailure) throw new Error(this.writeFailure);
		const records = this.accounts.get(accountId) ?? new Map<string, CachedRecord<T>>();
		for (const record of changes.put) records.set(record.key, record);
		for (const key of changes.remove) records.delete(key);
		this.accounts.set(accountId, records);
		if (changes.inventory) this.inventories.set(accountId, changes.inventory);
	}
}

/** A controllable network connection, with bodies delivered over that connection as evidence. */
export class InMemorySyncTransport<T> implements SyncReadTransport<T> {
	readonly records = new Map<string, SyncSnapshot<T>>();
	readonly deliveredBodies: string[] = [];
	inventoryFailure: string | null = null;
	readFailure: string | null = null;
	private readonly paused = new Map<string, { start: () => void; ready: Promise<void> }>();

	pause(key: string): { started: Promise<void>; release: () => void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.paused.set(key, { start: started.resolve, ready: ready.promise });
		return { started: started.promise, release: ready.resolve };
	}

	async inventory() {
		if (this.inventoryFailure) throw new Error(this.inventoryFailure);
		const entries = [...this.records].map(([key, snapshot]) => ({ key, etag: snapshot.etag }));
		await this.wait('inventory');
		return entries;
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

import type { SyncResourceRules } from '$lib/services/sync/state';
import type {
	CacheCommit,
	StoredCache,
	CachedRecord,
	ResourceState,
	SyncCursor
} from '$lib/models/sync';
import type { SyncCacheRepository } from './cache';

export interface CacheCheckpoint {
	readonly cursor: SyncCursor;
	readonly inventoryComplete: boolean;
}
export interface CacheTransaction<T> {
	resources(keys: readonly string[]): Promise<ReadonlyMap<string, ResourceState<T> | undefined>>;
	checkpoint(): Promise<CacheCheckpoint | null>;
	put(records: readonly CachedRecord<T>[]): Promise<void>;
	remove(keys: readonly string[]): Promise<void>;
	putCheckpoint(checkpoint: CacheCheckpoint): Promise<void>;
}
export interface CacheStorage<T> {
	load(accountId: string): Promise<StoredCache<T>>;
	transaction<R>(accountId: string, work: (tx: CacheTransaction<T>) => Promise<R>): Promise<R>;
}
/** Merge against the values read in this transaction, including writes from other tabs. */
export class CachePersistence<T> implements SyncCacheRepository<T> {
	constructor(
		private readonly syncResourceRules: SyncResourceRules,
		private readonly storage: CacheStorage<T>
	) {}
	load(accountId: string) {
		return this.storage.load(accountId);
	}
	async commit(accountId: string, changes: CacheCommit<T>): Promise<void> {
		await this.storage.transaction(accountId, async (tx) => {
			const keys = [...changes.put.map((row) => row.key), ...changes.remove.map((row) => row.key)];
			if (new Set(keys).size !== keys.length)
				throw new Error('A cache commit must touch each resource only once');
			const previous = await tx.resources(keys);
			await tx.put(
				changes.put.map((proposed) => ({
					key: proposed.key,
					entry: this.syncResourceRules.mergeResourceStates(
						previous.get(proposed.key),
						proposed.entry
					)
				}))
			);
			await tx.remove(
				changes.remove
					.filter((removal) => {
						const entry = previous.get(removal.key);
						return (
							entry === undefined || this.syncResourceRules.resourceVersion(entry) === removal.etag
						);
					})
					.map((removal) => removal.key)
			);
			if (changes.cursor !== undefined) {
				const previous = await tx.checkpoint();
				if (previous === null || BigInt(changes.cursor) >= BigInt(previous.cursor))
					await tx.putCheckpoint({
						cursor: changes.cursor,
						inventoryComplete: previous?.inventoryComplete || changes.inventoryComplete === true
					});
			}
		});
	}
}

import { CachePersistence, type CacheStorage } from '$lib/controllers/sync/cache-persistence';
import type { SyncCacheRepository } from '$lib/controllers/sync/cache';
export const createCachePersistence = <T>(storage: CacheStorage<T>): SyncCacheRepository<T> =>
	new CachePersistence(storage);

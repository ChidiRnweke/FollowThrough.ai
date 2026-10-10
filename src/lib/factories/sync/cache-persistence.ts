import type { SyncCacheRepository } from '$lib/controllers/sync/cache';
import { CachePersistence } from '$lib/controllers/sync/cache-persistence';
import type { CacheStorage } from '$lib/models/browser-workspace';
import { CacheCommitService } from '$lib/services/sync/state';
export const createCachePersistence = <T>(storage: CacheStorage<T>): SyncCacheRepository<T> =>
	new CachePersistence(storage, new CacheCommitService());

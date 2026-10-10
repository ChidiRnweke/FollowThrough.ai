import {
	CacheSynchronization,
	type ResourceCacheController,
	type ResourceCacheDependencies
} from '$lib/controllers/sync/cache';
import { ResourceCacheStore } from '$lib/stores/sync/cache';

export const createResourceCache = <T>(
	accountId: string,
	dependencies: ResourceCacheDependencies<T>,
	state = new ResourceCacheStore<T>()
): ResourceCacheController<T> => new CacheSynchronization(accountId, dependencies, state);

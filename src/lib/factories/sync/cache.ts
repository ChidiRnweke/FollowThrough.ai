import { SyncResourceRulesService } from '$lib/services/sync/state';
import {
	CacheSynchronization,
	type ResourceCacheController,
	type ResourceCacheDependencies
} from '$lib/controllers/sync/cache';
import { ResourceCacheStore } from '$lib/stores/sync/cache';

export const createResourceCache = <T>(
	accountId: string,
	dependencies: ResourceCacheDependencies<T>
): ResourceCacheController<T> =>
	new CacheSynchronization(
		new SyncResourceRulesService(),
		accountId,
		dependencies,
		new ResourceCacheStore<T>()
	);

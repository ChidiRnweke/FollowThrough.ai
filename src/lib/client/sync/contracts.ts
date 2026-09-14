import type { ResourceState, SyncCursor, SyncEtag, SyncObjectRead } from '$lib/models/sync';
import type { SyncPage } from '$lib/models/sync';

export interface CachedRecord<T> {
	readonly key: string;
	readonly entry: ResourceState<T>;
}

export interface CacheCommit<T> {
	readonly generation?: string;
	readonly put: readonly CachedRecord<T>[];
	readonly remove: readonly { readonly key: string; readonly etag: SyncEtag | null }[];
	readonly cursor?: SyncCursor;
	readonly inventoryComplete?: boolean;
}

export interface StoredCache<T> {
	readonly generation: string;
	readonly inventoryComplete: boolean;
	readonly records: readonly CachedRecord<T>[];
	readonly cursor: SyncCursor | null;
}

export interface SyncCacheRepository<T> {
	load(accountId: string): Promise<StoredCache<T>>;
	commit(accountId: string, changes: CacheCommit<T>): Promise<void>;
}

export type ObjectRead<T> = SyncObjectRead<T>;

export interface SyncReadTransport<T> {
	pull(since: SyncCursor): Promise<SyncPage<T>>;
	read(key: string, etag: SyncEtag | null): Promise<ObjectRead<T>>;
}

export type SynchronizationResult =
	| { readonly kind: 'idle' }
	| { readonly kind: 'complete' }
	| { readonly kind: 'offline' }
	| { readonly kind: 'unavailable' }
	| { readonly kind: 'stopped' }
	| { readonly kind: 'failure'; readonly message: string };

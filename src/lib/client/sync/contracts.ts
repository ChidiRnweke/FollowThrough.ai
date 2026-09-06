import type {
	ResourceState,
	SyncCursor,
	SyncChanges,
	SyncEtag,
	SyncObjectRead
} from '$lib/models/sync';

export interface CachedRecord<T> {
	readonly key: string;
	readonly entry: ResourceState<T>;
}

export interface CacheCommit<T> {
	readonly put: readonly CachedRecord<T>[];
	readonly remove: readonly string[];
	readonly cursor?: SyncCursor;
}

export interface StoredCache<T> {
	readonly records: readonly CachedRecord<T>[];
	readonly cursor: SyncCursor | null;
}

export interface SyncCacheRepository<T> {
	load(accountId: string): Promise<StoredCache<T>>;
	commit(accountId: string, changes: CacheCommit<T>): Promise<void>;
}

export type ObjectRead<T> = SyncObjectRead<T>;

export interface SyncReadTransport<T> {
	pull(since: SyncCursor): Promise<SyncChanges>;
	read(key: string, etag: SyncEtag | null): Promise<ObjectRead<T>>;
}

export type SynchronizationResult =
	| { readonly kind: 'idle' }
	| { readonly kind: 'complete' }
	| { readonly kind: 'offline' }
	| { readonly kind: 'unavailable' }
	| { readonly kind: 'stopped' }
	| { readonly kind: 'failure'; readonly message: string };

import type {
	ResourceState,
	SyncCursor,
	SyncChanges,
	SyncEtag,
	SyncObjectRead
} from '$lib/models/sync';
import type { SyncChangePage } from '$lib/models/sync';

export interface CachedRecord<T> {
	readonly key: string;
	readonly entry: ResourceState<T>;
}

export interface CacheCommit<T> {
	readonly generation?: number;
	readonly put: readonly CachedRecord<T>[];
	readonly remove: readonly { readonly key: string; readonly etag: SyncEtag | null }[];
	readonly cursor?: SyncCursor;
	readonly inventoryComplete?: boolean;
}

export interface StoredCache<T> {
	readonly generation: number;
	readonly inventoryComplete: boolean;
	readonly records: readonly CachedRecord<T>[];
	readonly cursor: SyncCursor | null;
}

export interface SyncCacheRepository<T> {
	load(accountId: string): Promise<StoredCache<T>>;
	commit(accountId: string, changes: CacheCommit<T>): Promise<CacheCommit<T>>;
}

export type ObjectRead<T> = SyncObjectRead<T>;

export interface SyncReadTransport<T> {
	pull(since: SyncCursor): Promise<SyncChanges | SyncChangePage>;
	read(key: string, etag: SyncEtag | null): Promise<ObjectRead<T>>;
	readMany?(
		requests: readonly { key: string; etag: SyncEtag | null }[]
	): Promise<
		readonly { key: string; result: ObjectRead<T> | { kind: 'failure'; message: string } }[]
	>;
}

export type SynchronizationResult =
	| { readonly kind: 'idle' }
	| { readonly kind: 'complete' }
	| { readonly kind: 'offline' }
	| { readonly kind: 'unavailable' }
	| { readonly kind: 'stopped' }
	| { readonly kind: 'failure'; readonly message: string };

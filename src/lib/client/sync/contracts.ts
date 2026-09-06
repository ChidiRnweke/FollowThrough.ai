import type { CacheEntry, InventoryEntry, SyncEtag, SyncSnapshot } from '$lib/models/sync';

export interface CachedRecord<T> {
	readonly key: string;
	readonly entry: CacheEntry<T>;
}

export interface CacheCommit<T> {
	readonly put: readonly CachedRecord<T>[];
	readonly remove: readonly string[];
	readonly inventory?: readonly InventoryEntry[];
}

export interface StoredCache<T> {
	readonly records: readonly CachedRecord<T>[];
	readonly inventory: readonly InventoryEntry[] | null;
}

export interface SyncCacheRepository<T> {
	load(accountId: string): Promise<StoredCache<T>>;
	commit(accountId: string, changes: CacheCommit<T>): Promise<void>;
}

export type ObjectRead<T> =
	| { readonly kind: 'found'; readonly snapshot: SyncSnapshot<T> }
	| { readonly kind: 'unchanged'; readonly etag: SyncEtag }
	| { readonly kind: 'unavailable' };

export interface SyncReadTransport<T> {
	inventory(): Promise<readonly InventoryEntry[]>;
	read(key: string, etag: SyncEtag | null): Promise<ObjectRead<T>>;
}

export type SynchronizationResult =
	| { readonly kind: 'idle' }
	| { readonly kind: 'complete' }
	| { readonly kind: 'offline' }
	| { readonly kind: 'unavailable' }
	| { readonly kind: 'stopped' }
	| { readonly kind: 'failure'; readonly message: string };

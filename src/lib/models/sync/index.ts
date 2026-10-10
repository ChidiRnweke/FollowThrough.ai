import { z } from 'zod';

export interface SyncIndicatorInput {
	readonly online: boolean;
	readonly pending: number;
	readonly sending: boolean;
	readonly review: number;
	readonly failedDownloads: number;
	readonly downloading: boolean;
	readonly failure: string | null;
}
export type SyncEtag = string & { readonly __brand: 'SyncEtag' };
export const syncCursorSchema = z
	.string()
	.regex(/^(0|[1-9][0-9]*)$/)
	.transform((value) => value as string & { readonly __brand: 'SyncCursor' });
export type SyncCursor = z.infer<typeof syncCursorSchema>;
export const initialSyncCursor = '0' as SyncCursor;
export const syncEtagSchema = z
	.string()
	.regex(/^sync-v1-[1-9][0-9]*$/)
	.transform((value) => value as SyncEtag);

export const resourceChangeSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('upsert'), key: z.string().min(1), etag: syncEtagSchema }),
	z.object({ kind: z.literal('delete'), key: z.string().min(1), etag: syncEtagSchema })
]);
export type ResourceChange = z.infer<typeof resourceChangeSchema>;
export const syncChangesSchema = z
	.object({
		cursor: syncCursorSchema,
		changes: z.array(resourceChangeSchema)
	})
	.refine(
		(batch) => new Set(batch.changes.map((change) => change.key)).size === batch.changes.length,
		'A change batch must contain each resource only once'
	);
export type SyncChanges = z.infer<typeof syncChangesSchema>;
export const syncChangePageSchema = syncChangesSchema.safeExtend({ hasMore: z.boolean() });
export type SyncChangePage = z.infer<typeof syncChangePageSchema>;

/** A replication page carries every body needed to commit its checkpoint. */
export interface SyncPage<T> {
	readonly cursor: SyncCursor;
	readonly hasMore: boolean;
	readonly records: readonly {
		readonly key: string;
		readonly resource:
			{ readonly kind: 'found'; readonly snapshot: SyncSnapshot<T> } | ResourceDeletion;
	}[];
}
export const syncPageSchema = <T>(value: z.ZodType<T>): z.ZodType<SyncPage<T>> =>
	z
		.object({
			cursor: syncCursorSchema,
			hasMore: z.boolean(),
			records: z.array(
				z.object({
					key: z.string().min(1),
					resource: z.discriminatedUnion('kind', [
						z.object({
							kind: z.literal('found'),
							snapshot: z.object({ etag: syncEtagSchema, value })
						}),
						z.object({ kind: z.literal('deleted'), etag: syncEtagSchema })
					])
				})
			)
		})
		.refine(
			(page) => new Set(page.records.map((record) => record.key)).size === page.records.length,
			'A sync page must contain each resource only once'
		);

// The PostgreSQL/PWA benchmark at docs/pr-evidence/workspace-sync-simplification/README.md
// measured 219 commits and 14 seconds of long tasks with 32-record pages. Amortize page overhead.
// This is a transfer group, never a limit on the workspace inventory.
export const syncChangePageSize = 128;

export interface SyncSnapshot<T> {
	readonly etag: SyncEtag;
	readonly value: T;
}

export const deletionSchema = z.object({ kind: z.literal('deleted'), etag: syncEtagSchema });
export type ResourceDeletion = z.infer<typeof deletionSchema>;

export type SyncObjectRead<T> =
	| { readonly kind: 'found'; readonly snapshot: SyncSnapshot<T> }
	| { readonly kind: 'unchanged'; readonly etag: SyncEtag }
	| ResourceDeletion
	| { readonly kind: 'unavailable' };

/** What the last targeted read of an uncached record learned. Never persisted. */
export type TransferState =
	{ readonly kind: 'missing' } | { readonly kind: 'failed'; readonly message: string };

/** Complete versioned records or tombstones. Network attempts are not persisted. */
export type ResourceState<T> =
	{ readonly kind: 'present'; readonly snapshot: SyncSnapshot<T> } | ResourceDeletion;
export const resourceStateSchema = <T>(value: z.ZodType<T>): z.ZodType<ResourceState<T>> =>
	z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('present'), snapshot: z.object({ etag: syncEtagSchema, value }) }),
		deletionSchema
	]);
export type CacheAccess<T> =
	| { readonly kind: 'ready'; readonly value: T }
	| { readonly kind: 'wait' }
	| { readonly kind: 'unavailable' }
	| { readonly kind: 'deleted' }
	| { readonly kind: 'failure'; readonly message: string };

/** Transient account synchronization results; never persisted as resource state. */
export type SynchronizationResult =
	| { readonly kind: 'idle' }
	| { readonly kind: 'complete' }
	| { readonly kind: 'offline' }
	| { readonly kind: 'unavailable' }
	| { readonly kind: 'stopped' }
	| { readonly kind: 'failure'; readonly message: string };
export type SubmissionResult = SynchronizationResult | { readonly kind: 'waiting' };
export type SyncLane = 'pull' | 'writes';
export interface SyncLaneState {
	readonly requested: boolean;
	readonly running: Promise<void> | null;
	readonly retry: number | null;
	readonly failures: number;
	readonly result: SubmissionResult;
}
export interface SyncWriteRetry {
	readonly attempts: number;
	readonly at: number;
}
export interface SyncScheduler {
	now(): number;
	schedule(at: number, work: () => Promise<void>): () => void;
}

export interface CachedRecord<T> {
	readonly key: string;
	readonly entry: ResourceState<T>;
}

export interface CacheCommit<T> {
	readonly put: readonly CachedRecord<T>[];
	readonly remove: readonly { readonly key: string; readonly etag: SyncEtag | null }[];
	readonly cursor?: SyncCursor;
	readonly inventoryComplete?: boolean;
}

export interface StoredCache<T> {
	readonly inventoryComplete: boolean;
	readonly records: readonly CachedRecord<T>[];
	readonly cursor: SyncCursor | null;
}

/** Database sequence values are transported without JavaScript number rounding. */
export const syncEtag = (version: bigint): SyncEtag => {
	if (version <= 0n) throw new Error('A synchronization version must be positive');
	return `sync-v1-${version}` as SyncEtag;
};

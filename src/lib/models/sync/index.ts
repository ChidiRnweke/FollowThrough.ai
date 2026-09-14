import { z } from 'zod';

export const initialCacheGeneration = '00000000-0000-0000-0000-000000000000';

export const storageRecoveryItemSchema = z.object({
	accountId: z.string(),
	source: z.string(),
	key: z.string(),
	message: z.string(),
	impact: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('cache') }),
		z.object({
			kind: z.literal('resource'),
			key: z.string().min(1),
			operationId: z.string().uuid().nullable()
		}),
		z.object({ kind: z.literal('write'), operationId: z.string().uuid().nullable() })
	])
});
export type StorageRecoveryItem = z.infer<typeof storageRecoveryItemSchema>;

export interface SyncIndicatorInput {
	readonly online: boolean;
	readonly pending: number;
	readonly sending: boolean;
	readonly review: number;
	readonly failedDownloads: number;
	readonly downloading: boolean;
	readonly failure: string | null;
}
export const syncIndicator = (
	input: SyncIndicatorInput
): {
	kind: 'synced' | 'saving' | 'offline' | 'downloading' | 'attention';
	headline: string;
	description: string;
	badge: number;
} => {
	if (input.review || input.failedDownloads || input.failure)
		return {
			kind: 'attention',
			headline: input.review
				? `${input.review} ${input.review === 1 ? 'change needs' : 'changes need'} a decision`
				: 'Sync needs attention',
			description:
				input.failure ??
				(input.failedDownloads
					? `${input.failedDownloads} saved copies could not be downloaded. Retry to complete your workspace.`
					: 'Review the versions and choose which changes to keep.'),
			badge: input.review
		};
	if (!input.online)
		return {
			kind: 'offline',
			headline: "You're offline",
			description: input.pending
				? `${input.pending} ${input.pending === 1 ? 'change' : 'changes'} will sync when you're back online.`
				: 'Downloaded content remains available on this device.',
			badge: input.pending
		};
	if (input.pending || input.sending)
		return {
			kind: 'saving',
			headline: 'Saving your changes',
			description: 'Your changes are saved on this device while they sync.',
			badge: 0
		};
	if (input.downloading)
		return {
			kind: 'downloading',
			headline: 'Downloading your workspace',
			description: 'Saved copies are becoming available for offline use.',
			badge: 0
		};
	return {
		kind: 'synced',
		headline: 'Everything is saved',
		description: 'Your workspace is up to date on this device.',
		badge: 0
	};
};

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

/** Database sequence values are transported without JavaScript number rounding. */
export const syncEtag = (version: bigint): SyncEtag => {
	if (version <= 0n) throw new Error('A synchronization version must be positive');
	return `sync-v1-${version}` as SyncEtag;
};

export const compareSyncEtags = (left: SyncEtag, right: SyncEtag): number => {
	const a = BigInt(left.slice(8));
	const b = BigInt(right.slice(8));
	return a < b ? -1 : a > b ? 1 : 0;
};

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

// The 7,000-record browser benchmark is recorded in docs/pr-evidence/incremental-sync/performance.md.
// These are transfer groups, never limits on the workspace inventory.
export const syncChangePageSize = 256;
export const syncBodyBatchSize = 32;

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

export type TransferState =
	| { readonly kind: 'queued' }
	| { readonly kind: 'fetching' }
	| { readonly kind: 'failed'; readonly message: string };

/** Durable facts only. Freshness follows from the known version and retained body. */
export type ResourceState<T> =
	| { readonly kind: 'requested' }
	| { readonly kind: 'present'; readonly etag: SyncEtag; readonly body: SyncSnapshot<T> | null }
	| ResourceDeletion;

export const resourceVersionsConsistent = <T>(state: ResourceState<T>): boolean =>
	state.kind !== 'present' ||
	state.body === null ||
	compareSyncEtags(state.body.etag, state.etag) <= 0;

export const resourceStateSchema = <T>(value: z.ZodType<T>): z.ZodType<ResourceState<T>> =>
	z
		.discriminatedUnion('kind', [
			z.object({ kind: z.literal('requested') }),
			z.object({
				kind: z.literal('present'),
				etag: syncEtagSchema,
				body: z.object({ etag: syncEtagSchema, value }).nullable()
			}),
			deletionSchema
		])
		.refine(
			resourceVersionsConsistent,
			'A retained body cannot be newer than the known resource version'
		);

export const resourceVersion = <T>(state: ResourceState<T> | undefined): SyncEtag | null =>
	state && state.kind !== 'requested' ? state.etag : null;

export const cachedSnapshot = <T>(state: ResourceState<T> | undefined): SyncSnapshot<T> | null =>
	state?.kind === 'present' ? state.body : null;

export const resourceCurrent = <T>(state: ResourceState<T> | undefined): boolean =>
	state?.kind === 'present' && state.body?.etag === state.etag;

/** The storage transaction is the sole owner of monotonic version knowledge. */
export const mergeResourceStates = <T>(
	current: ResourceState<T> | undefined,
	incoming: ResourceState<T>
): ResourceState<T> => {
	if (!current || current.kind === 'requested') return incoming;
	if (incoming.kind === 'requested') return current;
	const order = compareSyncEtags(incoming.etag, current.etag);
	if (current.kind === 'deleted') return order > 0 ? incoming : current;
	if (incoming.kind === 'deleted') return order >= 0 ? incoming : current;
	const body =
		incoming.body && (!current.body || compareSyncEtags(incoming.body.etag, current.body.etag) > 0)
			? incoming.body
			: current.body;
	return { kind: 'present', etag: order > 0 ? incoming.etag : current.etag, body };
};

export const receiveResource = <T>(
	state: ResourceState<T> | undefined,
	received: SyncSnapshot<T> | ResourceDeletion
): ResourceState<T> =>
	mergeResourceStates(
		state,
		'kind' in received ? received : { kind: 'present', etag: received.etag, body: received }
	);

/** Absence from a journal batch conveys no change. */
export const applyResourceChanges = <T>(
	current: ReadonlyMap<string, ResourceState<T>>,
	changes: readonly ResourceChange[]
): ReadonlyMap<string, ResourceState<T>> => {
	const next = new Map(current);
	for (const change of changes)
		next.set(
			change.key,
			mergeResourceStates(
				current.get(change.key),
				change.kind === 'delete'
					? { kind: 'deleted', etag: change.etag }
					: { kind: 'present', etag: change.etag, body: null }
			)
		);
	return next;
};

export type CacheAccess<T> =
	| { readonly kind: 'ready'; readonly value: T }
	| { readonly kind: 'wait' }
	| { readonly kind: 'unavailable' }
	| { readonly kind: 'deleted' }
	| { readonly kind: 'failure'; readonly message: string };

export const accessCache = <T>(
	state: ResourceState<T> | undefined,
	online: boolean,
	transfer?: TransferState
): CacheAccess<T> => {
	if (state?.kind === 'deleted') return { kind: 'deleted' };
	const snapshot = cachedSnapshot(state);
	if (snapshot && (resourceCurrent(state) || !online))
		return { kind: 'ready', value: snapshot.value };
	if (!online) return { kind: 'unavailable' };
	if (transfer?.kind === 'failed') return { kind: 'failure', message: transfer.message };
	return { kind: 'wait' };
};

/** A collection is usable only when its membership and every required body are known. */
export const collectionReadiness = <T>(
	inventoryComplete: boolean,
	entries: readonly ResourceState<T>[]
): 'unknown' | 'incomplete' | 'ready' => {
	if (!inventoryComplete) return 'unknown';
	return entries.every((entry) => entry.kind === 'deleted' || cachedSnapshot(entry) !== null)
		? 'ready'
		: 'incomplete';
};

export const recoveryBlocksWrite = (
	impact: StorageRecoveryItem['impact'],
	key: string
): boolean => {
	if (impact.kind === 'cache') return false;
	if (impact.kind === 'write') return true;
	return impact.key === key;
};

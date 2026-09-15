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
export const resourceVersion = <T>(state: ResourceState<T> | undefined): SyncEtag | null =>
	state?.kind === 'present' ? state.snapshot.etag : (state?.etag ?? null);
export const cachedSnapshot = <T>(state: ResourceState<T> | undefined): SyncSnapshot<T> | null =>
	state?.kind === 'present' ? state.snapshot : null;
export const resourceCurrent = <T>(state: ResourceState<T> | undefined): boolean =>
	state?.kind === 'present';
/** Page replication, targeted reads and write receipts all use the same monotonic merge. */
export const mergeResourceStates = <T>(
	current: ResourceState<T> | undefined,
	incoming: ResourceState<T>
): ResourceState<T> => {
	if (!current) return incoming;
	const before = current.kind === 'present' ? current.snapshot.etag : current.etag;
	const after = incoming.kind === 'present' ? incoming.snapshot.etag : incoming.etag;
	const order = compareSyncEtags(after, before);
	return order > 0 || (order === 0 && incoming.kind === 'deleted') ? incoming : current;
};
export const receiveResource = <T>(
	state: ResourceState<T> | undefined,
	received: SyncSnapshot<T> | ResourceDeletion
): ResourceState<T> =>
	mergeResourceStates(
		state,
		'kind' in received ? received : { kind: 'present', snapshot: received }
	);

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
	if (snapshot) return { kind: 'ready', value: snapshot.value };
	if (!online || transfer?.kind === 'missing') return { kind: 'unavailable' };
	if (transfer?.kind === 'failed') return { kind: 'failure', message: transfer.message };
	return { kind: 'wait' };
};

/** One wording for each state a surface cannot render, named for the resource it concerns. */
export const accessMessage = <T>(
	access: Exclude<CacheAccess<T>, { kind: 'ready' }>,
	name: string
): string => {
	if (access.kind === 'failure') return access.message;
	if (access.kind === 'deleted') return `This ${name} was deleted.`;
	return `This ${name} is not available on this device. Reconnect to download it.`;
};

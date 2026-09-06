import { z } from 'zod';

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

export type CacheEntry<T> =
	| { readonly kind: 'uncached' }
	| { readonly kind: 'cached'; readonly snapshot: SyncSnapshot<T> }
	| {
			readonly kind: 'updating';
			readonly previous: SyncSnapshot<T> | null;
			readonly target: SyncEtag | null;
			readonly transfer: TransferState;
	  };

/** Server existence is independent of cache freshness and of a pending local draft. */
export type ResourceState<T> =
	{ readonly kind: 'present'; readonly cache: CacheEntry<T> } | ResourceDeletion;

export const resourceStateSchema = <T>(value: z.ZodType<T>): z.ZodType<ResourceState<T>> =>
	z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('present'), cache: cacheEntrySchema(value) }),
		deletionSchema
	]);

export const resourceVersion = <T>(state: ResourceState<T>): SyncEtag | null =>
	state.kind === 'deleted'
		? state.etag
		: state.cache.kind === 'updating'
			? (state.cache.target ?? state.cache.previous?.etag ?? null)
			: state.cache.kind === 'cached'
				? state.cache.snapshot.etag
				: null;

export const receiveResource = <T>(
	state: ResourceState<T>,
	received: SyncSnapshot<T> | ResourceDeletion
): ResourceState<T> => {
	const known = resourceVersion(state);
	if (known && compareSyncEtags(received.etag, known) < 0) return state;
	if ('kind' in received) return received;
	if (state.kind === 'deleted' && received.etag === state.etag) return state;
	return {
		kind: 'present',
		cache: transitionCache(state.kind === 'present' ? state.cache : { kind: 'uncached' }, {
			kind: 'receive',
			snapshot: received
		})
	};
};

/** A compact journal batch changes only the named resources, never infers deletion from absence. */
export const applyResourceChanges = <T>(
	current: ReadonlyMap<string, ResourceState<T>>,
	changes: readonly ResourceChange[]
): ReadonlyMap<string, ResourceState<T>> => {
	const next = new Map(current);
	for (const change of changes) {
		const previous = current.get(change.key);
		if (previous) {
			const known = resourceVersion(previous);
			if (known && compareSyncEtags(change.etag, known) < 0) continue;
			if (previous.kind === 'deleted' && change.kind === 'upsert' && change.etag === previous.etag)
				continue;
		}
		next.set(
			change.key,
			change.kind === 'delete'
				? { kind: 'deleted', etag: change.etag }
				: {
						kind: 'present',
						cache: transitionCache(
							previous?.kind === 'present' ? previous.cache : { kind: 'uncached' },
							{ kind: 'observe', etag: change.etag }
						)
					}
		);
	}
	return next;
};

export type CacheEvent<T> =
	| { readonly kind: 'observe'; readonly etag: SyncEtag }
	| { readonly kind: 'request' }
	| { readonly kind: 'receive'; readonly snapshot: SyncSnapshot<T> }
	| { readonly kind: 'failure'; readonly message: string };

export const cacheEntrySchema = <T>(value: z.ZodType<T>): z.ZodType<CacheEntry<T>> => {
	const snapshot = z.object({ etag: syncEtagSchema, value });
	return z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('uncached') }),
		z.object({ kind: z.literal('cached'), snapshot }),
		z.object({
			kind: z.literal('updating'),
			previous: snapshot.nullable(),
			target: syncEtagSchema.nullable(),
			transfer: z.discriminatedUnion('kind', [
				z.object({ kind: z.literal('queued') }),
				z.object({ kind: z.literal('fetching') }),
				z.object({ kind: z.literal('failed'), message: z.string() })
			])
		})
	]);
};

export const cachedSnapshot = <T>(entry: CacheEntry<T>): SyncSnapshot<T> | null =>
	entry.kind === 'cached' ? entry.snapshot : entry.kind === 'updating' ? entry.previous : null;

/** No I/O: all readers, including offline readers, share these freshness rules. */
export const transitionCache = <T>(entry: CacheEntry<T>, event: CacheEvent<T>): CacheEntry<T> => {
	const previous = cachedSnapshot(entry);
	switch (event.kind) {
		case 'observe': {
			const known = entry.kind === 'updating' ? entry.target : previous?.etag;
			if (known && compareSyncEtags(event.etag, known) <= 0) return entry;
			return {
				kind: 'updating',
				previous,
				target: event.etag,
				transfer: entry.kind === 'updating' ? entry.transfer : { kind: 'queued' }
			};
		}
		case 'request':
			return {
				kind: 'updating',
				previous,
				target: entry.kind === 'updating' ? entry.target : (previous?.etag ?? null),
				transfer: { kind: 'fetching' }
			};
		case 'receive': {
			if (previous && compareSyncEtags(event.snapshot.etag, previous.etag) < 0) return entry;
			if (
				entry.kind === 'updating' &&
				entry.target &&
				compareSyncEtags(event.snapshot.etag, entry.target) < 0
			)
				return { ...entry, previous: event.snapshot, transfer: { kind: 'queued' } };
			return { kind: 'cached', snapshot: event.snapshot };
		}
		case 'failure':
			return entry.kind === 'updating'
				? { ...entry, transfer: { kind: 'failed', message: event.message } }
				: entry;
	}
};

export type CacheAccess<T> =
	| { readonly kind: 'ready'; readonly value: T }
	| { readonly kind: 'wait' }
	| { readonly kind: 'unavailable' }
	| { readonly kind: 'deleted' }
	| { readonly kind: 'failure'; readonly message: string };

export const accessCache = <T>(entry: CacheEntry<T>, online: boolean): CacheAccess<T> => {
	const snapshot = cachedSnapshot(entry);
	if (entry.kind === 'cached' || (!online && snapshot))
		return snapshot ? { kind: 'ready', value: snapshot.value } : { kind: 'unavailable' };
	if (!online) return { kind: 'unavailable' };
	if (entry.kind === 'updating' && entry.transfer.kind === 'failed')
		return { kind: 'failure', message: entry.transfer.message };
	return { kind: 'wait' };
};

export interface LocalChange<T> {
	readonly operationId: string;
	readonly generation: number;
	readonly base: SyncSnapshot<T> | null;
	readonly local: T | null;
}

export type MutationState<T> =
	| { readonly kind: 'clean' }
	| { readonly kind: 'pending'; readonly change: LocalChange<T>; readonly next: LocalChange<T> }
	| { readonly kind: 'sending'; readonly change: LocalChange<T>; readonly sent: LocalChange<T> }
	| {
			readonly kind: 'conflict';
			readonly change: LocalChange<T>;
			readonly remote: SyncSnapshot<T> | null;
	  }
	| { readonly kind: 'rejected'; readonly change: LocalChange<T>; readonly message: string };

/** Staging during a send retains the immutable sent operation for its eventual receipt. */
export const stageMutation = <T>(
	state: MutationState<T>,
	change: LocalChange<T>
): MutationState<T> => {
	if (state.kind !== 'clean' && change.generation <= state.change.generation)
		throw new Error('A concurrent local edit must be reconciled before replacing this draft');
	if (state.kind === 'sending') return { ...state, change };
	if (state.kind === 'conflict') return { ...state, change };
	if (state.kind === 'pending') return { ...state, change };
	return { kind: 'pending', change, next: change };
};

export const beginMutation = <T>(state: MutationState<T>): MutationState<T> =>
	state.kind === 'pending' ? { kind: 'sending', change: state.change, sent: state.next } : state;

export const acknowledgeMutation = <T>(
	state: MutationState<T>,
	operationId: string,
	server: SyncSnapshot<T> | null
): MutationState<T> => {
	if (state.kind !== 'sending' || state.sent.operationId !== operationId) return state;
	if (state.sent.generation === state.change.generation) return { kind: 'clean' };
	const change = { ...state.change, base: server };
	return { kind: 'pending', change, next: change };
};

export const retryMutation = <T>(state: MutationState<T>): MutationState<T> =>
	state.kind === 'sending' ? { kind: 'pending', change: state.change, next: state.sent } : state;

export const conflictMutation = <T>(
	state: MutationState<T>,
	operationId: string,
	remote: SyncSnapshot<T> | null
): MutationState<T> =>
	state.kind === 'sending' && state.sent.operationId === operationId
		? { kind: 'conflict', change: state.change, remote }
		: state;

export const rejectMutation = <T>(
	state: MutationState<T>,
	operationId: string,
	message: string
): MutationState<T> =>
	state.kind === 'sending' && state.sent.operationId === operationId
		? { kind: 'rejected', change: state.change, message }
		: state;

export const keepLocalMutation = <T>(
	state: MutationState<T>,
	operationId: string
): MutationState<T> => {
	if (state.kind !== 'conflict') return state;
	if (operationId === state.change.operationId)
		throw new Error('Conflict resolution requires a new operation identity');
	if (!state.remote) throw new Error('A deleted record must be explicitly recreated');
	const change = {
		...state.change,
		base: state.remote,
		operationId,
		generation: state.change.generation + 1
	};
	return { kind: 'pending', change, next: change };
};

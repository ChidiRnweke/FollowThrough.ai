import { z } from 'zod';
import {
	syncEtagSchema,
	compareSyncEtags,
	cachedSnapshot,
	type ResourceState,
	type CacheAccess,
	deletionSchema,
	type SyncSnapshot,
	type SyncEtag,
	type SyncObjectRead
} from '$lib/models/sync';

export type ServerResource<T> = Exclude<SyncObjectRead<T>, { kind: 'unchanged' }>;
export type WriteReceipt<T> = {
	readonly operationId: string;
	readonly resource: Exclude<ServerResource<T>, { kind: 'unavailable' }>;
};
/** One exact applied outcome per resource; ordinary cache refreshes never replace this proof. */
export const writeReceiptSchema = <T>(value: z.ZodType<T>): z.ZodType<WriteReceipt<T>> =>
	z.object({
		operationId: z.string().uuid(),
		resource: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('found'), snapshot: z.object({ etag: syncEtagSchema, value }) }),
			deletionSchema
		])
	});

export const retainWriteReceipt = <T>(
	previous: WriteReceipt<T> | null,
	received: WriteReceipt<T>
): WriteReceipt<T> => {
	const version = (receipt: WriteReceipt<T>) =>
		receipt.resource.kind === 'found' ? receipt.resource.snapshot.etag : receipt.resource.etag;
	return previous && compareSyncEtags(version(previous), version(received)) >= 0
		? previous
		: received;
};

export type WriteOutcome<T> =
	| { readonly kind: 'applied'; readonly receipt: WriteReceipt<T> }
	| { readonly kind: 'conflict'; readonly remote: ServerResource<T> }
	| { readonly kind: 'rejected'; readonly message: string };

/** Imported drafts may retain a real base representation before learning its sync validator. */
export type WriteBase<T> = { readonly etag: SyncEtag | null; readonly value: T };
export type WriteObservation<T> =
	| Exclude<ServerResource<T>, { kind: 'found' }>
	| { readonly kind: 'found'; readonly snapshot: WriteBase<T> };
export type WriteBaseResolution<T> =
	| { readonly kind: 'matched'; readonly snapshot: SyncSnapshot<T> }
	| { readonly kind: 'conflict'; readonly remote: ServerResource<T> };

export interface WriteDraft<C, T> {
	readonly operationId: string;
	readonly key: string;
	readonly command: C;
	readonly base: WriteBase<T> | null;
	/** The pending local version this edit was made against, separate from queue order. */
	readonly basedOn: string | null;
	readonly local: T | null;
	readonly coalesce: string | null;
	readonly references: readonly string[];
}

export type WriteIntent<C, T> = Omit<WriteDraft<C, T>, 'references'> & {
	readonly dependencies: readonly string[];
};
export type Delivery<T> =
	| { readonly kind: 'queued' }
	| { readonly kind: 'sending' }
	| { readonly kind: 'retry'; readonly message: string }
	| { readonly kind: 'conflict'; readonly remote: WriteObservation<T> }
	| { readonly kind: 'rejected'; readonly message: string };
export interface OutboxEntry<C, T> {
	readonly sequence: number;
	readonly intent: WriteIntent<C, T>;
	readonly delivery: Delivery<T>;
}

export const outboxEntrySchema = <C, T>(
	command: z.ZodType<C>,
	value: z.ZodType<T>
): z.ZodType<OutboxEntry<C, T>> => {
	const snapshot = z.object({ etag: syncEtagSchema.nullable(), value });
	return z.object({
		sequence: z.number().int().positive(),
		intent: z.object({
			operationId: z.string().uuid(),
			key: z.string().min(1),
			command,
			base: z.object({ etag: syncEtagSchema.nullable(), value }).nullable(),
			basedOn: z.string().uuid().nullable(),
			local: value.nullable(),
			coalesce: z.string().nullable(),
			dependencies: z.array(z.string().uuid())
		}),
		delivery: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('queued') }),
			z.object({ kind: z.literal('sending') }),
			z.object({ kind: z.literal('retry'), message: z.string() }),
			z.object({ kind: z.literal('rejected'), message: z.string() }),
			z.object({
				kind: z.literal('conflict'),
				remote: z.discriminatedUnion('kind', [
					z.object({ kind: z.literal('found'), snapshot }),
					deletionSchema,
					z.object({ kind: z.literal('unavailable') })
				])
			})
		])
	});
};

/** Append in one storage transaction so another tab cannot bypass a preceding local write. */
export const appendWrite = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	draft: WriteDraft<C, T>,
	sequence: number,
	receipt: WriteReceipt<T> | null = null
): readonly OutboxEntry<C, T>[] => {
	if (entries.some((entry) => entry.intent.operationId === draft.operationId))
		throw new Error('A local operation identity must be unique');
	if (draft.basedOn === draft.operationId) throw new Error('An edit cannot be based on itself');
	const parent = entries.find((entry) => entry.intent.operationId === draft.basedOn);
	if (parent && parent.intent.key !== draft.key)
		throw new Error('A local base must belong to the edited resource');
	const applied = !parent && receipt?.operationId === draft.basedOn ? receipt : null;
	if (applied?.resource.kind === 'found')
		draft = { ...draft, base: applied.resource.snapshot, basedOn: null };
	const latest = new Map(entries.map((entry) => [entry.intent.key, entry]));
	const previous = latest.get(draft.key);
	const dependencies = [
		...new Set(
			[draft.key, ...draft.references].flatMap((key) => {
				const entry = latest.get(key);
				return entry ? [entry.intent.operationId] : [];
			})
		)
	];
	const { references, ...intent } = draft;
	void references;
	if (
		previous?.delivery.kind === 'queued' &&
		draft.basedOn === previous.intent.operationId &&
		draft.coalesce !== null &&
		previous.intent.coalesce === draft.coalesce &&
		!entries.some((entry) => entry.intent.dependencies.includes(previous.intent.operationId))
	) {
		return entries.map((entry) =>
			entry !== previous
				? entry
				: {
						...entry,
						intent: {
							...entry.intent,
							operationId: draft.operationId,
							command: draft.command,
							local: draft.local,
							dependencies: [
								...new Set([
									...entry.intent.dependencies,
									...dependencies.filter((id) => id !== entry.intent.operationId)
								])
							]
						}
					}
		);
	}
	return [
		...entries,
		{
			sequence,
			intent: { ...intent, dependencies },
			delivery:
				applied?.resource.kind === 'deleted'
					? { kind: 'conflict', remote: applied.resource }
					: { kind: 'queued' }
		}
	];
};

export const nextWrite = <C, T>(entries: readonly OutboxEntry<C, T>[]): OutboxEntry<C, T> | null =>
	entries.find(
		(entry) =>
			(entry.delivery.kind === 'queued' || entry.delivery.kind === 'retry') &&
			(entry.intent.base === null || entry.intent.base.etag !== null) &&
			entry.intent.dependencies.length === 0
	) ?? null;

export const beginWrite = <C, T>(entry: OutboxEntry<C, T>): OutboxEntry<C, T> => {
	if (
		(entry.delivery.kind !== 'queued' && entry.delivery.kind !== 'retry') ||
		entry.intent.dependencies.length ||
		(entry.intent.base !== null && entry.intent.base.etag === null)
	)
		throw new Error('Only an unblocked queued write can be sent');
	return { ...entry, delivery: { kind: 'sending' } };
};

export const failWrite = <C, T>(entry: OutboxEntry<C, T>, message: string): OutboxEntry<C, T> =>
	entry.delivery.kind === 'sending' ? { ...entry, delivery: { kind: 'retry', message } } : entry;

/** Only successful acknowledgement unblocks descendants and changes their server base. */
export const acknowledgeWrite = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	receipt: WriteReceipt<T>
): readonly OutboxEntry<C, T>[] => {
	const sent = entries.find((entry) => entry.intent.operationId === receipt.operationId);
	if (!sent) return entries;
	if (sent.delivery.kind !== 'sending' && sent.delivery.kind !== 'retry')
		throw new Error('Only a submitted write can be acknowledged');
	return entries
		.filter((entry) => entry !== sent)
		.map((entry) => {
			if (!entry.intent.dependencies.includes(receipt.operationId)) return entry;
			return {
				...entry,
				delivery:
					entry.intent.basedOn === receipt.operationId && receipt.resource.kind === 'deleted'
						? { kind: 'conflict' as const, remote: receipt.resource }
						: entry.delivery,
				intent: {
					...entry.intent,
					dependencies: entry.intent.dependencies.filter((id) => id !== receipt.operationId),
					basedOn: entry.intent.basedOn === receipt.operationId ? null : entry.intent.basedOn,
					base:
						entry.intent.basedOn === receipt.operationId
							? receipt.resource.kind === 'found'
								? receipt.resource.snapshot
								: entry.intent.base
							: entry.intent.base
				}
			};
		});
};

export const settleWrite = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	operationId: string,
	outcome: WriteOutcome<T>
): readonly OutboxEntry<C, T>[] => {
	if (outcome.kind === 'applied') {
		if (outcome.receipt.operationId !== operationId)
			throw new Error('The receipt identifies another operation');
		return acknowledgeWrite(entries, outcome.receipt);
	}
	return entries.map((entry) =>
		entry.intent.operationId === operationId &&
		(entry.delivery.kind === 'sending' || entry.delivery.kind === 'retry')
			? { ...entry, delivery: outcome }
			: entry
	);
};

/** Lists may use retained bodies while detail reads enforce the cache's online barrier. */
export const visibleResources = <C, T>(
	records: ReadonlyMap<string, ResourceState<T>>,
	pending: readonly OutboxEntry<C, T>[]
): ReadonlyMap<string, T> => {
	const visible = new Map<string, T>();
	for (const [key, entry] of records) {
		const snapshot = entry.kind === 'present' ? cachedSnapshot(entry.cache) : null;
		if (snapshot) visible.set(key, snapshot.value);
	}
	for (const { intent } of pending) {
		if (intent.local === null) visible.delete(intent.key);
		else visible.set(intent.key, intent.local);
	}
	return visible;
};

/** A local edit remains usable even while its server base is refreshing or conflicted. */
export const localResource = <C, T>(
	pending: readonly OutboxEntry<C, T>[],
	key: string
): CacheAccess<T> | null => {
	const last = pending.findLast((entry) => entry.intent.key === key);
	if (!last) return null;
	return last.intent.local === null
		? { kind: 'deleted' }
		: { kind: 'ready', value: last.intent.local };
};

/** Explicitly retaining a conflicting edit starts a new version-guarded operation. */
export const retryConflictedWrite = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	operationId: string,
	replacementId: string
): readonly OutboxEntry<C, T>[] => {
	const conflict = entries.find((entry) => entry.intent.operationId === operationId);
	if (!conflict || conflict.delivery.kind !== 'conflict')
		throw new Error('This edit has no unresolved server conflict');
	if (
		replacementId === operationId ||
		entries.some((entry) => entry.intent.operationId === replacementId)
	)
		throw new Error('Conflict resolution requires a new operation identity');
	if (conflict.delivery.remote.kind !== 'found')
		throw new Error('A deleted or unavailable resource must be explicitly recreated');
	const base = conflict.delivery.remote.snapshot;
	return entries.map((entry) =>
		entry === conflict
			? {
					...entry,
					intent: { ...entry.intent, operationId: replacementId, base, basedOn: null },
					delivery: { kind: 'queued' }
				}
			: {
					...entry,
					intent: {
						...entry.intent,
						dependencies: entry.intent.dependencies.map((id) =>
							id === operationId ? replacementId : id
						),
						basedOn: entry.intent.basedOn === operationId ? replacementId : entry.intent.basedOn
					}
				}
	);
};

export const unresolvedWrite = <C, T>(
	entries: readonly OutboxEntry<C, T>[]
): OutboxEntry<C, T> | null =>
	entries.find(
		(entry) =>
			entry.delivery.kind === 'queued' &&
			entry.intent.dependencies.length === 0 &&
			entry.intent.base !== null &&
			entry.intent.base.etag === null
	) ?? null;

/** The operation id changes whenever unsent input is coalesced, so an obsolete resolution is ignored. */
export const resolveWriteBase = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	operationId: string,
	resolution: WriteBaseResolution<T>
): readonly OutboxEntry<C, T>[] =>
	entries.map((entry) => {
		if (
			entry.intent.operationId !== operationId ||
			entry.delivery.kind !== 'queued' ||
			entry.intent.base === null ||
			entry.intent.base.etag !== null
		)
			return entry;
		return resolution.kind === 'matched'
			? { ...entry, intent: { ...entry.intent, base: resolution.snapshot } }
			: { ...entry, delivery: resolution };
	});

/** Discard exactly the reviewed set. Unknown outcomes and unselected dependents must be resolved first. */
export const discardWrites = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	operationIds: readonly string[]
): readonly OutboxEntry<C, T>[] => {
	const selected = new Set(operationIds);
	if (operationIds.some((id) => !entries.some((entry) => entry.intent.operationId === id)))
		throw new Error('The selected local edits changed; review them again');
	for (const entry of entries) {
		if (selected.has(entry.intent.operationId)) {
			if (entry.delivery.kind === 'sending' || entry.delivery.kind === 'retry')
				throw new Error('Check the server receipt before discarding an attempted edit');
		} else if (
			entry.intent.dependencies.some((id) => selected.has(id)) ||
			(entry.intent.basedOn !== null && selected.has(entry.intent.basedOn))
		)
			throw new Error('Review dependent edits before discarding their base');
	}
	return entries.filter((entry) => !selected.has(entry.intent.operationId));
};

export const authoritativeWriteResource = <T>(
	outcome: WriteOutcome<T>
): WriteReceipt<T>['resource'] | null => {
	const resource =
		outcome.kind === 'applied'
			? outcome.receipt.resource
			: outcome.kind === 'conflict'
				? outcome.remote
				: null;
	return resource?.kind === 'unavailable' ? null : resource;
};

export type WriteContent<C, T> = Pick<
	WriteDraft<C, T>,
	'command' | 'local' | 'coalesce' | 'references'
>;
export type DraftStatus = 'loading' | 'synced' | 'saving' | 'pending' | 'conflict' | 'error';
export interface WriteConflictView<T> {
	readonly base: T | null;
	readonly local: T | null;
	readonly remote:
		{ readonly kind: 'found'; readonly value: T } | { readonly kind: 'deleted' | 'unavailable' };
}

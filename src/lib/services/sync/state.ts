import type {
	OutboxEntry,
	WriteDraft,
	WriteReceipt,
	WriteOutcome,
	WriteBaseResolution,
	ServerResource
} from '$lib/models/outbox';
import type {
	SyncEtag,
	ResourceState,
	ResourceDeletion,
	SyncSnapshot,
	CacheAccess,
	TransferState
} from '$lib/models/sync';

export const compareSyncEtags = (left: SyncEtag, right: SyncEtag): number => {
	const a = BigInt(left.slice(8));
	const b = BigInt(right.slice(8));
	return a < b ? -1 : a > b ? 1 : 0;
};

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

/** Append in one storage transaction so another tab cannot bypass a preceding local write. */
export const appendWrite = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	draft: WriteDraft<C, T>,
	sequence: number,
	receipt: WriteReceipt<T> | null = null,
	observed: ServerResource<T> = { kind: 'unavailable' }
): readonly OutboxEntry<C, T>[] => {
	if (entries.some((entry) => entry.intent.operationId === draft.operationId))
		throw new Error('A local operation identity must be unique');
	if (draft.basedOn === draft.operationId) throw new Error('An edit cannot be based on itself');
	const parent = entries.find((entry) => entry.intent.operationId === draft.basedOn);
	if (parent && parent.intent.key !== draft.key)
		throw new Error('A local base must belong to the edited resource');
	const applied = !parent && receipt?.operationId === draft.basedOn ? receipt : null;
	const missingAncestry = draft.basedOn !== null && !parent && !applied;
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
		(previous?.delivery.kind === 'queued' || previous?.delivery.kind === 'rejected') &&
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
						delivery: { kind: 'queued' },
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
			delivery: missingAncestry
				? {
						kind: 'conflict',
						remote: observed.kind === 'unavailable' && receipt ? receipt.resource : observed
					}
				: applied?.resource.kind === 'deleted'
					? { kind: 'conflict', remote: applied.resource }
					: { kind: 'queued' }
		}
	];
};

export const nextWrite = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	excluded: ReadonlySet<string> = new Set()
): OutboxEntry<C, T> | null =>
	entries.find(
		(entry) =>
			!excluded.has(entry.intent.operationId) &&
			(entry.delivery.kind === 'queued' || entry.delivery.kind === 'retry') &&
			entry.intent.dependencies.length === 0
	) ?? null;

export const beginWrite = <C, T>(entry: OutboxEntry<C, T>): OutboxEntry<C, T> => {
	if (
		(entry.delivery.kind !== 'queued' && entry.delivery.kind !== 'retry') ||
		entry.intent.dependencies.length
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
	if (outcome.kind === 'proven') {
		if (outcome.proof.operationId !== operationId)
			throw new Error('The proof identifies another operation');
		return entries
			.filter((entry) => entry.intent.operationId !== operationId)
			.map((entry) => {
				if (!entry.intent.dependencies.includes(operationId)) return entry;
				return {
					...entry,
					delivery:
						entry.intent.basedOn === operationId
							? { kind: 'conflict' as const, remote: { kind: 'unavailable' as const } }
							: entry.delivery,
					intent: {
						...entry.intent,
						dependencies: entry.intent.dependencies.filter((id) => id !== operationId)
					}
				};
			});
	}
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

/** Lists and detail reads share retained content while replication runs. */
export const visibleResources = <C, T>(
	records: ReadonlyMap<string, ResourceState<T>>,
	pending: readonly OutboxEntry<C, T>[]
): ReadonlyMap<string, T> => {
	const visible = new Map<string, T>();
	for (const [key, entry] of records) {
		const snapshot = entry.kind === 'present' ? cachedSnapshot(entry) : null;
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
	if (conflict.intent.base === null)
		throw new Error('A new item must be explicitly recreated to retain both copies');
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

/** Refresh only the server side of a conflict; keep the observed base and local edit. */
export const resolveWriteBase = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	operationId: string,
	resolution: WriteBaseResolution<T>
): readonly OutboxEntry<C, T>[] =>
	entries.map((entry) =>
		entry.intent.operationId === operationId && entry.delivery.kind === 'conflict'
			? { ...entry, delivery: resolution }
			: entry
	);

/** Include every descendant so a review cannot hide edits that depend on the selected base. */
export const dependentWrites = <C, T>(
	entries: readonly OutboxEntry<C, T>[],
	operationId: string
): readonly OutboxEntry<C, T>[] => {
	const selected = new Set([operationId]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const { intent } of entries) {
			if (
				!selected.has(intent.operationId) &&
				((intent.basedOn !== null && selected.has(intent.basedOn)) ||
					intent.dependencies.some((id) => selected.has(id)))
			) {
				selected.add(intent.operationId);
				changed = true;
			}
		}
	}
	return entries.filter((entry) => selected.has(entry.intent.operationId));
};

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

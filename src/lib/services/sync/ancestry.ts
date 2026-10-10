import type { OutboxEntry, WriteBase, WriteDraft, WriteReceipt } from '$lib/models/outbox';

export type DraftAncestry<C, T> =
	| { readonly kind: 'unchanged' }
	| { readonly kind: 'adopt'; readonly draft: WriteDraft<C, T> }
	| {
			readonly kind: 'replay';
			readonly observed: T;
			readonly onto: T;
			readonly base: WriteBase<T> | null;
			readonly basedOn: string | null;
	  };
export interface ConflictAncestry<C, T> {
	readonly entry: OutboxEntry<C, T>;
	readonly observed: T;
	readonly local: T;
	readonly remote: WriteBase<T>;
	readonly descendants: readonly OutboxEntry<C, T>[];
}
export interface IWriteAncestryService {
	draft<C, T>(
		entries: readonly OutboxEntry<C, T>[],
		draft: WriteDraft<C, T>,
		receipt: WriteReceipt<T> | null,
		newerReceipt: boolean
	): DraftAncestry<C, T>;
	conflict<C, T>(
		entries: readonly OutboxEntry<C, T>[],
		operationId: string
	): ConflictAncestry<C, T> | null;
	acceptConflict<C, T>(
		entries: readonly OutboxEntry<C, T>[],
		conflict: ConflictAncestry<C, T>,
		value: T,
		replayed: ReadonlyMap<string, T>
	): readonly OutboxEntry<C, T>[];
}
/** Ancestry decisions are pure; callers coordinate each record replay. */
export class WriteAncestryService implements IWriteAncestryService {
	draft<C, T>(
		entries: readonly OutboxEntry<C, T>[],
		draft: WriteDraft<C, T>,
		receipt: WriteReceipt<T> | null,
		newerReceipt: boolean
	): DraftAncestry<C, T> {
		const latest = entries.findLast((entry) => entry.intent.key === draft.key);
		if (latest?.intent.operationId === draft.basedOn) return { kind: 'unchanged' };
		const onto = latest
			? { base: latest.intent.base, basedOn: latest.intent.operationId, value: latest.intent.local }
			: receipt?.resource.kind === 'found' &&
				  draft.basedOn === null &&
				  draft.base !== null &&
				  newerReceipt
				? { base: receipt.resource.snapshot, basedOn: null, value: receipt.resource.snapshot.value }
				: null;
		if (!onto) return { kind: 'unchanged' };
		if (draft.local === null)
			return { kind: 'adopt', draft: { ...draft, base: onto.base, basedOn: onto.basedOn } };
		const parent = entries.find((entry) => entry.intent.operationId === draft.basedOn);
		const observed =
			draft.basedOn === null
				? (draft.base?.value ?? null)
				: parent
					? parent.intent.local
					: receipt?.operationId === draft.basedOn && receipt.resource.kind === 'found'
						? receipt.resource.snapshot.value
						: null;
		return observed === null || onto.value === null
			? { kind: 'unchanged' }
			: { kind: 'replay', observed, onto: onto.value, base: onto.base, basedOn: onto.basedOn };
	}
	conflict<C, T>(
		entries: readonly OutboxEntry<C, T>[],
		operationId: string
	): ConflictAncestry<C, T> | null {
		const entry = entries.find((entry) => entry.intent.operationId === operationId);
		if (
			entry?.delivery.kind !== 'conflict' ||
			entry.delivery.remote.kind !== 'found' ||
			entry.intent.base === null ||
			entry.intent.local === null
		)
			return null;
		return {
			entry,
			observed: entry.intent.base.value,
			local: entry.intent.local,
			remote: entry.delivery.remote.snapshot,
			descendants: entries.filter(
				(child) =>
					child !== entry &&
					child.intent.key === entry.intent.key &&
					child.sequence >= entry.sequence &&
					child.intent.local !== null
			)
		};
	}
	acceptConflict<C, T>(
		entries: readonly OutboxEntry<C, T>[],
		conflict: ConflictAncestry<C, T>,
		value: T,
		replayed: ReadonlyMap<string, T>
	): readonly OutboxEntry<C, T>[] {
		return entries.map((entry) =>
			entry === conflict.entry
				? {
						...entry,
						intent: { ...entry.intent, base: conflict.remote, basedOn: null, local: value },
						delivery: { kind: 'queued' }
					}
				: replayed.has(entry.intent.operationId)
					? {
							...entry,
							intent: { ...entry.intent, local: replayed.get(entry.intent.operationId)! }
						}
					: entry
		);
	}
}

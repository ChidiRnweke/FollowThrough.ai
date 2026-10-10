import type { OutboxEntry, WriteDraft, WriteReceipt, WriteRebase } from '$lib/models/outbox';
import { compareSyncEtags } from '$lib/services/sync/state';
/** Rebase coordination is synchronous so callers can keep it inside their storage transaction. */
export interface WriteAncestryController<T> {
	draft<C>(
		entries: readonly OutboxEntry<C, T>[],
		draft: WriteDraft<C, T>,
		receipt: WriteReceipt<T> | null
	): WriteDraft<C, T>;
	conflicted<C>(
		entries: readonly OutboxEntry<C, T>[],
		operationId: string
	): readonly OutboxEntry<C, T>[];
}
export class WriteAncestry<T> implements WriteAncestryController<T> {
	constructor(private readonly rebase: WriteRebase<T>) {}
	/**
	 * The durable queue, not the caller's in-memory copy, decides what a new edit is based on.
	 * A caller may have computed its edit from a version that an earlier local edit to the same
	 * resource has already superseded, for example when two quick edits start before the first is
	 * visible to the second. Those edits are this device's own history and precede the new edit, so
	 * the new edit's changed fields are replayed onto the latest local version and the edit is
	 * stacked on it. It then inherits that version's server base once the earlier edit is applied.
	 */
	draft<C>(
		entries: readonly OutboxEntry<C, T>[],
		draft: WriteDraft<C, T>,
		receipt: WriteReceipt<T> | null
	): WriteDraft<C, T> {
		const latest = entries.findLast((entry) => entry.intent.key === draft.key);
		if (latest?.intent.operationId === draft.basedOn) return draft;
		const onto = latest
			? { base: latest.intent.base, basedOn: latest.intent.operationId, value: latest.intent.local }
			: receipt?.resource.kind === 'found' &&
				  draft.basedOn === null &&
				  draft.base !== null &&
				  compareSyncEtags(receipt.resource.snapshot.etag, draft.base.etag) > 0
				? { base: receipt.resource.snapshot, basedOn: null, value: receipt.resource.snapshot.value }
				: null;
		if (!onto) return draft;
		if (draft.local === null) return { ...draft, base: onto.base, basedOn: onto.basedOn };
		const parent = entries.find((entry) => entry.intent.operationId === draft.basedOn);
		const observed =
			draft.basedOn === null
				? (draft.base?.value ?? null)
				: parent
					? parent.intent.local
					: receipt?.operationId === draft.basedOn && receipt.resource.kind === 'found'
						? receipt.resource.snapshot.value
						: null;
		if (observed === null || onto.value === null) return draft;
		const rebased = this.rebase(observed, draft.local, onto.value);
		return rebased
			? { ...draft, base: onto.base, basedOn: onto.basedOn, local: rebased.value }
			: draft;
	}
	/**
	 * A version conflict is a question only when the server changed a field this edit also changed.
	 * Otherwise the edit is replayed onto the server version and queued again, and later local edits
	 * to the same resource are replayed onto the result. The operation keeps its identity: the server
	 * records nothing for an operation it answered with a conflict, so the attempt is concluded and
	 * drafts, receipts and dependents that name the operation stay valid. Deletions, creations and
	 * overlapping fields stay for review.
	 */
	conflicted<C>(
		entries: readonly OutboxEntry<C, T>[],
		operationId: string
	): readonly OutboxEntry<C, T>[] {
		const conflict = entries.find((entry) => entry.intent.operationId === operationId);
		if (
			conflict?.delivery.kind !== 'conflict' ||
			conflict.delivery.remote.kind !== 'found' ||
			conflict.intent.base === null ||
			conflict.intent.local === null
		)
			return entries;
		const remote = conflict.delivery.remote.snapshot;
		const rebased = this.rebase(conflict.intent.base.value, conflict.intent.local, remote.value);
		if (!rebased || rebased.overlaps) return entries;
		let previous = { from: conflict.intent.local, to: rebased.value };
		return entries.map((entry): OutboxEntry<C, T> => {
			if (entry === conflict)
				return {
					...entry,
					intent: { ...entry.intent, base: remote, basedOn: null, local: rebased.value },
					delivery: { kind: 'queued' }
				};
			const local = entry.intent.local;
			if (entry.intent.key !== conflict.intent.key || entry.sequence < conflict.sequence || !local)
				return entry;
			const replayed = this.rebase(previous.from, local, previous.to);
			if (!replayed) return entry;
			previous = { from: local, to: replayed.value };
			return { ...entry, intent: { ...entry.intent, local: replayed.value } };
		});
	}
}

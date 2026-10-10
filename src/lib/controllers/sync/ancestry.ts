import type { OutboxEntry, WriteDraft, WriteRebase, WriteReceipt } from '$lib/models/outbox';
import type { IWriteAncestryService } from '$lib/services/sync/ancestry';
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
	constructor(
		private readonly rebase: WriteRebase<T>,
		private readonly rules: IWriteAncestryService
	) {}
	draft<C>(
		entries: readonly OutboxEntry<C, T>[],
		draft: WriteDraft<C, T>,
		receipt: WriteReceipt<T> | null
	): WriteDraft<C, T> {
		const newer =
			receipt?.resource.kind === 'found' &&
			draft.base !== null &&
			compareSyncEtags(receipt.resource.snapshot.etag, draft.base.etag) > 0;
		const decision = this.rules.draft(entries, draft, receipt, newer);
		if (decision.kind === 'unchanged') return draft;
		if (decision.kind === 'adopt') return decision.draft;
		if (draft.local === null) throw new Error('A deletion cannot request a record replay');
		const rebased = this.rebase(decision.observed, draft.local, decision.onto);
		return rebased
			? { ...draft, base: decision.base, basedOn: decision.basedOn, local: rebased.value }
			: draft;
	}
	conflicted<C>(
		entries: readonly OutboxEntry<C, T>[],
		operationId: string
	): readonly OutboxEntry<C, T>[] {
		const conflict = this.rules.conflict(entries, operationId);
		if (!conflict) return entries;
		const rebased = this.rebase(conflict.observed, conflict.local, conflict.remote.value);
		if (!rebased || rebased.overlaps) return entries;
		const replayed = new Map<string, T>();
		let previous = { from: conflict.local, to: rebased.value };
		for (const entry of conflict.descendants) {
			const local = entry.intent.local;
			if (local === null) throw new Error('A deletion cannot be an ancestry replay descendant');
			const next = this.rebase(previous.from, local, previous.to);
			if (!next) continue;
			previous = { from: local, to: next.value };
			replayed.set(entry.intent.operationId, next.value);
		}
		return this.rules.acceptConflict(entries, conflict, rebased.value, replayed);
	}
}

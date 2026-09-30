import type { WriteRebase } from '$lib/models/outbox';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { rebaseFields } from '$lib/services/sync/rebase';

/**
 * Fields the server reassigns on every accepted write. Two edits that both touch them have not
 * collided; the server's own value replaces the replayed one when the rebased edit is applied.
 */
const bookkeeping: ReadonlySet<string> = new Set(['updatedAt', 'currentRevision', 'completedAt']);

/** Workspace records replay field by field; a record never rebases onto another type. */
export const rebaseWorkspaceRecord: WriteRebase<WorkspaceRecord> = (observed, local, onto) => {
	if (observed.type !== onto.type || local.type !== onto.type) return null;
	const rebased = rebaseFields(observed.value, local.value, onto.value, bookkeeping);
	const record = structuredClone(onto);
	Object.assign(record.value, rebased.value);
	return { value: record, overlaps: rebased.overlaps };
};

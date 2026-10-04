import type { WriteRebase } from '$lib/models/outbox';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { rebaseFields } from '$lib/services/sync/rebase';
import { rebaseWidgetParts } from '$lib/services/widgets/edits';

/**
 * Fields the server reassigns on every accepted write. Two edits that both touch them have not
 * collided; the server's own value replaces the replayed one when the rebased edit is applied.
 */
const bookkeeping: ReadonlySet<string> = new Set(['updatedAt', 'currentRevision', 'completedAt']);

/**
 * Widget data merges path by path and its revisions follow the server, so the generic replay
 * leaves those fields to `rebaseWidgetParts` (ADR 0043).
 */
const widgetParts: ReadonlySet<string> = new Set([
	...bookkeeping,
	'data',
	'dataRevision',
	'layoutRevision'
]);

/** Workspace records replay field by field; a record never rebases onto another type. */
export const rebaseWorkspaceRecord: WriteRebase<WorkspaceRecord> = (observed, local, onto) => {
	if (observed.type !== onto.type || local.type !== onto.type) return null;
	if (observed.type === 'widgets' && local.type === 'widgets' && onto.type === 'widgets') {
		const fields = rebaseFields(observed.value, local.value, onto.value, widgetParts);
		const { overlaps, ...parts } = rebaseWidgetParts(observed.value, local.value, onto.value);
		return {
			value: { type: 'widgets', value: { ...fields.value, ...parts } },
			overlaps: fields.overlaps || overlaps
		};
	}
	const rebased = rebaseFields(observed.value, local.value, onto.value, bookkeeping);
	const record = structuredClone(onto);
	Object.assign(record.value, rebased.value);
	return { value: record, overlaps: rebased.overlaps };
};

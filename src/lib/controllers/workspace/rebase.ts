import { widgetCatalog } from '$lib/models/widgets';
import { createWidgetEditingController } from '$lib/factories/widgets/editing';
const widgetEditing = createWidgetEditingController();
import type { WriteRebase } from '$lib/models/outbox';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { rebaseFields } from '$lib/services/sync/rebase';
import { WidgetPatchService } from '$lib/services/widgets/patches';
const widgetPatches = new WidgetPatchService();

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
		const { overlaps, ...parts } = widgetPatches.rebaseParts(
			observed.value,
			local.value,
			onto.value
		);
		const candidate = { ...fields.value, ...parts };
		const validation = widgetEditing.validate(candidate, widgetCatalog);
		return {
			value: { type: 'widgets', value: candidate },
			overlaps: fields.overlaps || overlaps || validation.kind !== 'applied'
		};
	}
	const rebased = rebaseFields(observed.value, local.value, onto.value, bookkeeping);
	const record = structuredClone(onto);
	Object.assign(record.value, rebased.value);
	return { value: record, overlaps: rebased.overlaps };
};

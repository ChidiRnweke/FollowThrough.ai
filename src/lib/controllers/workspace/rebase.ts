import type { WriteRebase } from '$lib/models/outbox';
import { widgetCatalog, type WidgetCandidateReader } from '$lib/models/widgets';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { IWorkspaceFieldReplayService } from '$lib/services/sync/rebase';
import type { IWidgetEditingService } from '$lib/services/widgets/edits';
import type { IWidgetPatchService } from '$lib/services/widgets/patches';
export interface WorkspaceRebaseController {
	readonly rebase: WriteRebase<WorkspaceRecord>;
}
/** Sequence field replay and widget validation without delegating to a widget controller. */
export class WorkspaceRebase implements WorkspaceRebaseController {
	constructor(
		private readonly fields: IWorkspaceFieldReplayService,
		private readonly patches: IWidgetPatchService,
		private readonly reader: WidgetCandidateReader,
		private readonly editing: IWidgetEditingService
	) {}
	readonly rebase: WriteRebase<WorkspaceRecord> = (observed, local, onto) => {
		if (observed.type !== onto.type || local.type !== onto.type) return null;
		if (observed.type === 'widgets' && local.type === 'widgets' && onto.type === 'widgets') {
			const fields = this.fields.replay('widgets', observed.value, local.value, onto.value);
			const { overlaps, ...parts } = this.patches.rebaseParts(
				observed.value,
				local.value,
				onto.value
			);
			const candidate = { ...fields.value, ...parts };
			const read = this.reader.read(candidate, widgetCatalog);
			const validation =
				read.kind === 'invalid' ? read : this.editing.decide(read.widget, read.issues);
			return {
				value: { type: 'widgets', value: candidate },
				overlaps: fields.overlaps || overlaps || validation.kind !== 'applied'
			};
		}
		const rebased = this.fields.replay(onto.type, observed.value, local.value, onto.value);
		const record = structuredClone(onto);
		Object.assign(record.value, rebased.value);
		return { value: record, overlaps: rebased.overlaps };
	};
}

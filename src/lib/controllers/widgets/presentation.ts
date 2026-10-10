import type {
	JsonPatch,
	WidgetData,
	WidgetLayout,
	WidgetSourceRows,
	WidgetState
} from '$lib/models/widgets';
import type { IWidgetEvaluationService } from '$lib/services/widgets/edits';
import type { IWidgetPatchService } from '$lib/services/widgets/patches';

export interface WidgetPresentationController {
	render(layout: WidgetLayout, data: WidgetData, sources: WidgetSourceRows): WidgetState;
	changes(before: WidgetData, after: WidgetData): JsonPatch;
}

export class WidgetPresentation implements WidgetPresentationController {
	constructor(
		private readonly evaluation: IWidgetEvaluationService,
		private readonly patches: IWidgetPatchService
	) {}
	render(layout: WidgetLayout, data: WidgetData, sources: WidgetSourceRows): WidgetState {
		return this.evaluation.resolve(layout, data, sources);
	}
	changes(before: WidgetData, after: WidgetData): JsonPatch {
		return this.patches.diffData(before, after);
	}
}

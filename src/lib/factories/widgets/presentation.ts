import {
	WidgetPresentation,
	type WidgetPresentationController
} from '$lib/controllers/widgets/presentation';
import { WidgetEvaluationService } from '$lib/services/widgets/edits';
import { WidgetPatchService } from '$lib/services/widgets/patches';

export const createWidgetPresentationController = (): WidgetPresentationController =>
	new WidgetPresentation(new WidgetEvaluationService(), new WidgetPatchService());

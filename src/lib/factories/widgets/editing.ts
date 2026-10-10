import { JsonWidgetEditorReader } from '$lib/client/widgets/json-text';
import { WidgetEdits, type WidgetEditingController } from '$lib/controllers/widgets/editing';
import { WidgetEditingService } from '$lib/services/widgets/edits';
import { WidgetPatchService } from '$lib/services/widgets/patches';
import { CatalogWidgetCandidateReader } from '$lib/remote/widgets/candidate-reader';

export const createWidgetEditingController = (): WidgetEditingController =>
	new WidgetEdits(
		new WidgetPatchService(),
		new CatalogWidgetCandidateReader(),
		new WidgetEditingService(),
		new JsonWidgetEditorReader()
	);

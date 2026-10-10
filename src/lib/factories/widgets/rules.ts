import { CatalogWidgetCandidateReader } from '$lib/adapters/widgets/candidate-reader';
import type { WidgetEditingController } from '$lib/controllers/widgets/editing';
import type { WidgetCandidateReader, WidgetCatalogReader } from '$lib/models/widgets';
import {
	WidgetCatalogService,
	type IWidgetCatalogService
} from '$lib/services/widgets/catalog-prompt';
import { WidgetEditingService, type IWidgetEditingService } from '$lib/services/widgets/edits';
import { WidgetPatchService, type IWidgetPatchService } from '$lib/services/widgets/patches';
import { WidgetSearchService, type IWidgetSearchService } from '$lib/services/widgets/search-text';
import { WidgetLifecycleService, type IWidgetLifecycleService } from '$lib/services/widgets/trash';
import { createWidgetEditingController } from './editing';

export interface WidgetRules {
	readonly widgetEditingRules: IWidgetEditingService;
	readonly widgetPatches: IWidgetPatchService;
	readonly widgetCandidateReader: WidgetCandidateReader;
	readonly catalogReader: WidgetCatalogReader;
	readonly editing: WidgetEditingController;
	readonly lifecycle: IWidgetLifecycleService;
	readonly catalog: IWidgetCatalogService;
	readonly search: IWidgetSearchService;
}
export const createWidgetRules = (): WidgetRules => ({
	widgetEditingRules: new WidgetEditingService(),
	widgetPatches: new WidgetPatchService(),
	widgetCandidateReader: new CatalogWidgetCandidateReader(),
	catalogReader: new CatalogWidgetCandidateReader(),
	editing: createWidgetEditingController(),
	lifecycle: new WidgetLifecycleService(),
	catalog: new WidgetCatalogService(),
	search: new WidgetSearchService()
});

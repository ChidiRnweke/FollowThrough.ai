import { CatalogWidgetCandidateReader } from '$lib/adapters/widgets/candidate-reader';
import type { WidgetCatalogReader } from '$lib/models/widgets';
import { WidgetLifecycleService, type IWidgetLifecycleService } from '$lib/services/widgets/trash';
import {
	WidgetCatalogService,
	type IWidgetCatalogService
} from '$lib/services/widgets/catalog-prompt';
import { WidgetSearchService, type IWidgetSearchService } from '$lib/services/widgets/search-text';
import type { WidgetEditingController } from '$lib/controllers/widgets/editing';
import { createWidgetEditingController } from './editing';

export interface WidgetRules {
	readonly catalogReader: WidgetCatalogReader;
	readonly editing: WidgetEditingController;
	readonly lifecycle: IWidgetLifecycleService;
	readonly catalog: IWidgetCatalogService;
	readonly search: IWidgetSearchService;
}
export const createWidgetRules = (): WidgetRules => ({
	catalogReader: new CatalogWidgetCandidateReader(),
	editing: createWidgetEditingController(),
	lifecycle: new WidgetLifecycleService(),
	catalog: new WidgetCatalogService(),
	search: new WidgetSearchService()
});

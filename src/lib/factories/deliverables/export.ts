import { SyncResourceRulesService } from '$lib/services/sync/state';
import {
	DocumentExports,
	type DocumentExportController
} from '$lib/controllers/deliverables/export';
import { DocumentExportStore } from '$lib/stores/deliverables/export.svelte';
import { RemoteDocumentExport, BrowserDocumentPreviewUrls } from '$lib/client/deliverables/export';
import { createDiagramExports } from './diagrams';
import { workspaceSession } from '$lib/factories/workspace/session';
export const createDocumentExports = (): DocumentExportController =>
	new DocumentExports(
		new SyncResourceRulesService(),
		new DocumentExportStore(),
		workspaceSession,
		createDiagramExports(),
		new RemoteDocumentExport(),
		new BrowserDocumentPreviewUrls()
	);

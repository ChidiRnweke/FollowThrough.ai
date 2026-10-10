import {
	workspaceSessionState,
	workspaceSessionEnvironment
} from '$lib/factories/workspace/session';
import { workspaceAccounts } from '$lib/factories/workspace/capabilities';
import { CacheCommitService, WorkspaceProjectionService } from '$lib/services/sync/state';
import { BrowserWorkspaceEditingEnvironment } from '$lib/client/workspace/editing-environment.svelte';
import {
	DocumentExports,
	type DocumentExportController
} from '$lib/controllers/deliverables/export';
import { DocumentExportStore } from '$lib/stores/deliverables/export.svelte';
import { RemoteDocumentExport, BrowserDocumentPreviewUrls } from '$lib/client/deliverables/export';
import { BrowserExportDiagramImages } from '$lib/client/deliverables/diagram-images';
import { BrowserMermaidRenderer } from '$lib/client/diagrams/mermaid-rendering';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
import { ExportPreparationService } from '$lib/services/deliverables/export-preparation';
export const createDocumentExports = (): DocumentExportController =>
	new DocumentExports(new DocumentExportStore(), {
		session: workspaceSessionState,
		environment: workspaceSessionEnvironment,
		accounts: workspaceAccounts,
		snapshots: new BrowserWorkspaceEditingEnvironment(),
		cacheMerge: new CacheCommitService(),
		projection: new WorkspaceProjectionService(),
		preparation: new ExportPreparationService(),
		themes: new MermaidThemeService(),
		renderer: new BrowserMermaidRenderer(),
		images: new BrowserExportDiagramImages(),
		remote: new RemoteDocumentExport(),
		urls: new BrowserDocumentPreviewUrls()
	});

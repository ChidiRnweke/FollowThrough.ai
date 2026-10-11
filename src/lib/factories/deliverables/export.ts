import {
	DocumentExports,
	type DocumentExportController
} from '$lib/controllers/deliverables/export';
import { DocumentExportStore } from '$lib/stores/deliverables/export.svelte';
import { RemoteDocumentExport, BrowserDocumentPreviewUrls } from '$lib/client/deliverables/export';
import { BrowserExportDiagramImages } from '$lib/client/deliverables/diagram-images';
import { BrowserMermaidRenderer } from '$lib/client/diagrams/mermaid-rendering';
import { ExportPreparationService } from '$lib/services/deliverables/export-preparation';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
export const createDocumentExports = (): DocumentExportController =>
	new DocumentExports(
		new DocumentExportStore(),
		new ExportPreparationService(),
		new MermaidThemeService(),
		new BrowserMermaidRenderer(),
		new BrowserExportDiagramImages(),
		new RemoteDocumentExport(),
		new BrowserDocumentPreviewUrls()
	);

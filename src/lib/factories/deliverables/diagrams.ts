import {
	ExportDiagrams,
	type DiagramExportController
} from '$lib/controllers/deliverables/diagrams';
import { ExportPreparationService } from '$lib/services/deliverables/export-preparation';
import { BrowserExportDiagramImages } from '$lib/client/deliverables/diagram-images';
import { createMermaidDiagrams } from '$lib/factories/diagrams/mermaid';
export const createDiagramExports = (): DiagramExportController =>
	new ExportDiagrams(
		new ExportPreparationService(),
		createMermaidDiagrams(),
		new BrowserExportDiagramImages()
	);

import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
import type { Database } from '$lib/server/db';
import { ArtifactRecords } from '$lib/server/repositories/deliverables/postgres/artifacts';
import { ExportSettingsRecords } from '$lib/server/repositories/deliverables/postgres/export-settings';
import { TemplateRecords } from '$lib/server/repositories/deliverables/postgres/templates';
import { fetchRemoteDataUrl } from '$lib/server/repositories/deliverables/export-images';
import type { IAttachmentStorage } from '$lib/server/repositories/attachments/object-storage';
import { ArtifactLibrary } from '$lib/server/services/deliverables/artifacts';
import { packZip } from '$lib/server/services/deliverables/bundle';
import { generateDocx } from '$lib/server/services/deliverables/docx';
import { generatePdf } from '$lib/server/services/deliverables/pdf';
import {
	prepareExport,
	exportImageSources,
	exportDiagramReferences,
	exportWidgetReferences
} from '$lib/services/deliverables/export-preparation';
import { createDiagramExportRenderer } from '$lib/server/factories/capabilities/diagram-rendering-factory';
import { verifiedTemplateStyles } from '$lib/server/services/deliverables/template-styles';
import { DocumentTemplates } from '$lib/server/services/deliverables/templates';
import { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';

export interface DeliverablesCapabilityInput {
	readonly db: Database;
	readonly storage: IAttachmentStorage;
}

export const createDeliverablesCapability = (input: DeliverablesCapabilityInput) => ({
	templates: new DocumentTemplates(new TemplateRecords(input.db)),
	templateStorage: input.storage,
	templateStyles: verifiedTemplateStyles,
	artifacts: new ArtifactLibrary(
		new ArtifactRecords(input.db),
		new ExportSettingsRecords(input.db)
	),
	artifactStorage: input.storage,
	fetchImage: fetchRemoteDataUrl,
	prepareExport,
	exportImageSources,
	exportDiagramReferences,
	exportWidgetReferences,
	diagramRenderer: createDiagramExportRenderer(),
	mermaidThemes: new MermaidThemeService(),
	docxGenerator: generateDocx,
	pdfGenerator: generatePdf,
	zipPacker: packZip,
	markdownToContent: noteContentFromMarkdown
});

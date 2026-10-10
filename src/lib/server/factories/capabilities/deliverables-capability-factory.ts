import type { NoteMarkdownReader } from '$lib/server/controllers/notes/controller';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import type { TemplateStyleReader } from '$lib/server/controllers/deliverables/controller';
import type { DiagramExportRenderer } from '$lib/server/controllers/deliverables/diagram-rendering';
import {
	ExportSettingsRuleService,
	type ExportSettingsRules
} from '$lib/services/deliverables/settings';
import { ArtifactFileService, type ArtifactFiles } from '$lib/services/deliverables/artifact-files';
import { MermaidThemeService, type MermaidThemeRules } from '$lib/services/diagrams/mermaid-theme';
import type { Database } from '$lib/server/db';
import { ArtifactRecords } from '$lib/server/repositories/deliverables/postgres/artifacts';
import { ExportSettingsRecords } from '$lib/server/repositories/deliverables/postgres/export-settings';
import { TemplateRecords } from '$lib/server/repositories/deliverables/postgres/templates';
import { fetchRemoteDataUrl } from '$lib/server/repositories/deliverables/export-images';
import type { IAttachmentStorage } from '$lib/server/repositories/attachments/object-storage';
import {
	createArtifactServices,
	createTemplateServices,
	type ArtifactServices,
	type TemplateServices
} from './deliverable-storage-factory';
import {
	DocumentBundleService,
	type DocumentBundlePacker
} from '$lib/server/services/deliverables/bundle';
import { DocxDocumentService, type DocxRenderer } from '$lib/server/services/deliverables/docx';
import { createPdfRendering } from './pdf-rendering-factory';
import type { PdfRenderingController } from '$lib/server/controllers/deliverables/pdf';
import {
	ExportPreparationService,
	type ExportPreparation
} from '$lib/services/deliverables/export-preparation';
import { createDiagramExportRenderer } from '$lib/server/factories/capabilities/diagram-rendering-factory';
import { DocxTemplateStyleReader } from '$lib/server/adapters/deliverables/template-styles';

export interface DeliverablesCapabilityInput {
	readonly db: Database;
	readonly storage: IAttachmentStorage;
}

export interface DeliverablesCapability {
	readonly exportSettingsRules: ExportSettingsRules;
	readonly artifactFiles: ArtifactFiles;
	readonly templates: TemplateServices;
	readonly templateStorage: IAttachmentStorage;
	readonly templateStyles: TemplateStyleReader;
	readonly artifacts: ArtifactServices;
	readonly artifactStorage: IAttachmentStorage;
	readonly fetchImage: typeof fetchRemoteDataUrl;
	readonly prepareExport: ExportPreparation;
	readonly diagramRenderer: DiagramExportRenderer;
	readonly mermaidThemes: MermaidThemeRules;
	readonly docxGenerator: DocxRenderer;
	readonly pdfGenerator: PdfRenderingController;
	readonly zipPacker: DocumentBundlePacker;
	readonly markdownToContent: NoteMarkdownReader;
}
export const createDeliverablesCapability = (
	input: DeliverablesCapabilityInput
): DeliverablesCapability => ({
	exportSettingsRules: new ExportSettingsRuleService(),
	artifactFiles: new ArtifactFileService(),
	templates: createTemplateServices(new TemplateRecords(input.db)),
	templateStorage: input.storage,
	templateStyles: new DocxTemplateStyleReader(),
	artifacts: createArtifactServices(
		new ArtifactRecords(input.db),
		new ExportSettingsRecords(input.db)
	),
	artifactStorage: input.storage,
	fetchImage: fetchRemoteDataUrl,
	prepareExport: new ExportPreparationService(),
	diagramRenderer: createDiagramExportRenderer(),
	mermaidThemes: new MermaidThemeService(),
	docxGenerator: new DocxDocumentService(),
	pdfGenerator: createPdfRendering(),
	zipPacker: new DocumentBundleService(),
	markdownToContent: new NodeNoteMarkdown()
});

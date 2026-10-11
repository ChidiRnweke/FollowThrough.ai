import {
	WidgetExportService,
	type IWidgetExportService
} from '$lib/services/widgets/export-blocks';
import { WidgetSourceService, type IWidgetSourceService } from '$lib/services/widgets/sources';
import {
	WidgetEvaluationService,
	type IWidgetEvaluationService
} from '$lib/services/widgets/edits';
import type { NoteMarkdownReader } from '$lib/models/note-markdown';
import {
	DocxTemplateStyleReader,
	type TemplateStyleReader
} from '$lib/server/services/deliverables/template-styles';
import { NoteMarkdownCodec } from '$lib/infrastructure/notes/markdown';
import { PdfDocumentService, type PdfRendering } from '$lib/server/services/deliverables/pdf';
import {
	DiagramRenderingService,
	type DiagramRasterization
} from '$lib/server/services/deliverables/diagram-rendering';
import type { Database } from '$lib/server/db';
import type { IAttachmentStorage } from '$lib/server/services/attachments/object-storage';
import { fetchRemoteDataUrl } from '$lib/server/repositories/deliverables/export-images';
import { ArtifactRecords } from '$lib/server/repositories/deliverables/postgres/artifacts';
import { ExportSettingsRecords } from '$lib/server/repositories/deliverables/postgres/export-settings';
import { TemplateRecords } from '$lib/server/repositories/deliverables/postgres/templates';
import {
	DocumentBundleService,
	type DocumentBundlePacker
} from '$lib/server/services/deliverables/bundle';
import { DocxDocumentService, type DocxRenderer } from '$lib/server/services/deliverables/docx';
import { ArtifactFileService, type ArtifactFiles } from '$lib/services/deliverables/artifact-files';
import {
	ExportPreparationService,
	type ExportPreparation
} from '$lib/services/deliverables/export-preparation';
import {
	ExportSettingsRuleService,
	type ExportSettingsRules
} from '$lib/services/deliverables/settings';
import { MermaidThemeService, type MermaidThemeRules } from '$lib/services/diagrams/mermaid-theme';
import {
	createArtifactServices,
	createTemplateServices,
	type ArtifactServices,
	type TemplateServices
} from './deliverable-storage-factory';

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
	readonly diagramRenderer: DiagramRasterization;
	readonly mermaidThemes: MermaidThemeRules;
	readonly widgetExports: IWidgetExportService;
	readonly widgetSources: IWidgetSourceService;
	readonly widgetEvaluation: IWidgetEvaluationService;
	readonly docxGenerator: DocxRenderer;
	readonly pdfGenerator: PdfRendering;
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
	diagramRenderer: new DiagramRenderingService(),
	mermaidThemes: new MermaidThemeService(),
	widgetExports: new WidgetExportService(),
	widgetSources: new WidgetSourceService(),
	widgetEvaluation: new WidgetEvaluationService(),
	docxGenerator: new DocxDocumentService(),
	pdfGenerator: new PdfDocumentService(),
	zipPacker: new DocumentBundleService(),
	markdownToContent: new NoteMarkdownCodec()
});

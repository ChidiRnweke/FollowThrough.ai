import type { Database } from '$lib/server/db';
import type { ActorContext } from '$lib/models/identity';
import type { AttachmentId } from '$lib/models/attachments';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { ArtifactRecords } from '$lib/server/repositories/deliverables/postgres/artifacts';
import { ExportSettingsRecords } from '$lib/server/repositories/deliverables/postgres/export-settings';
import { TemplateRecords } from '$lib/server/repositories/deliverables/postgres/templates';
import type { IAttachmentStorage } from '$lib/server/services/attachments/storage';
import { ArtifactLibrary } from '$lib/server/services/deliverables/artifacts';
import { packZip } from '$lib/server/services/deliverables/bundle';
import { generateDocx } from '$lib/server/services/deliverables/docx';
import { generatePdf } from '$lib/server/services/deliverables/pdf';
import { extractTemplateStyles } from '$lib/server/services/deliverables/template-styles';
import { DocumentTemplates } from '$lib/server/services/deliverables/templates';
import type { NoteCatalog } from '$lib/server/services/notes/catalog';
import { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import {
	BoardPdfExport,
	type BoardExportProjectLister,
	type BoardExportTodoLister,
	type BoardExportTodoViewAssembler
} from '$lib/server/services/todos/board-export';

/** Mints presigned download URLs for app-owned attachment images during export. */
export interface AttachmentDownloader {
	downloadById(actor: ActorContext, attachmentId: AttachmentId): Promise<{ url: string }>;
}

export interface DeliverablesCapabilityInput {
	readonly db: Database;
	readonly storage: IAttachmentStorage;
	readonly transactionRunner: TransactionRunner;
	readonly provenance: ProvenanceRecorder;
	readonly notes: NoteCatalog;
	/** Board export re-reads the todos and resolves project names through these. */
	readonly todos: BoardExportTodoLister & BoardExportTodoViewAssembler;
	readonly projects: BoardExportProjectLister;
	/** Mints presigned download URLs for app-owned attachment images during export. */
	readonly attachmentDownloader: AttachmentDownloader;
}

export interface DeliverablesCapability {
	readonly templates: DocumentTemplates;
	readonly artifacts: ArtifactLibrary;
	/** Ephemeral kanban-board PDF export; persists no artifact. */
	readonly boardPdfExporter: BoardPdfExport;
}

export const createDeliverablesCapability = (
	input: DeliverablesCapabilityInput
): DeliverablesCapability => {
	const templateRepository = new TemplateRecords(input.db);
	return {
		templates: new DocumentTemplates(
			input.storage,
			templateRepository,
			input.transactionRunner,
			extractTemplateStyles
		),
		artifacts: new ArtifactLibrary(
			new ArtifactRecords(input.db),
			input.storage,
			generateDocx,
			generatePdf,
			input.provenance,
			input.notes,
			templateRepository,
			input.transactionRunner,
			new ExportSettingsRecords(input.db),
			input.attachmentDownloader,
			packZip
		),
		boardPdfExporter: new BoardPdfExport(
			input.todos,
			input.todos,
			input.projects,
			(source) => noteContentFromMarkdown(source).document,
			generatePdf
		)
	};
};

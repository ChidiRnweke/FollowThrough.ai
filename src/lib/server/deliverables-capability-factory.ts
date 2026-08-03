import type { Database } from '$lib/server/db';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { ArtifactRecords } from '$lib/server/repositories/deliverables/postgres/artifacts';
import { ExportSettingsRecords } from '$lib/server/repositories/deliverables/postgres/export-settings';
import { TemplateRecords } from '$lib/server/repositories/deliverables/postgres/templates';
import type { IAttachmentStorage } from '$lib/server/services/attachments/storage';
import { ArtifactLibrary } from '$lib/server/services/deliverables/artifacts';
import { generateDocx } from '$lib/server/services/deliverables/docx';
import { generatePdf, type GeneratePdfInput } from '$lib/server/services/deliverables/pdf';
import { extractTemplateStyles } from '$lib/server/services/deliverables/template-styles';
import { DocumentTemplates } from '$lib/server/services/deliverables/templates';
import type { NoteCatalog } from '$lib/server/services/notes/catalog';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';

export interface DeliverablesCapabilityInput {
	readonly db: Database;
	readonly storage: IAttachmentStorage;
	readonly transactionRunner: TransactionRunner;
	readonly provenance: ProvenanceRecorder;
	readonly notes: NoteCatalog;
}

export interface DeliverablesCapability {
	readonly templates: DocumentTemplates;
	readonly artifacts: ArtifactLibrary;
	/** The raw PDF pipeline, exposed for ephemeral exports that persist no artifact —
	    currently the todos board export. */
	readonly pdfGenerator: (input: GeneratePdfInput) => Promise<Buffer>;
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
			new ExportSettingsRecords(input.db)
		),
		pdfGenerator: generatePdf
	};
};

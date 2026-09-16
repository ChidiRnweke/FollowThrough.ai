import {
	Deliverables,
	type DeliverablesDependencies
} from '$lib/server/controllers/deliverables/controller';
import { ArtifactLibrary } from '$lib/server/services/deliverables/artifacts';
import { DocumentTemplates } from '$lib/server/services/deliverables/templates';
import {
	prepareExport,
	exportImageSources
} from '$lib/server/services/deliverables/export-preparation';
import { fetchRemoteDataUrl } from '$lib/server/repositories/deliverables/export-images';
import { packZip } from '$lib/server/services/deliverables/bundle';
import {
	InMemoryArtifactRepository,
	InMemoryAttachmentStorage,
	InMemoryTemplateRepository
} from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { InMemoryExportSettingsRepository } from '$lib/testing/deliverables/fakes/in-memory-export-settings-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

export const exportControllerFixture = (overrides: Partial<DeliverablesDependencies> = {}) => {
	const artifacts = new InMemoryArtifactRepository();
	const storage = new InMemoryAttachmentStorage();
	const notes = new InMemoryNoteContent();
	const templates = new InMemoryTemplateRepository();
	const exportSettings = new InMemoryExportSettingsRepository();
	const provenance = new InMemoryProvenanceRecorder();
	const library = new ArtifactLibrary(artifacts, exportSettings);
	const service = new Deliverables(
		capabilityDependencies<DeliverablesDependencies>({
			templates: new DocumentTemplates(templates),
			artifactStorage: storage,
			artifactWriter: library,
			artifactReader: library,
			artifactLister: library,
			artifactDeleter: library,
			exportSettingsReader: library,
			exportSettingsWriter: library,
			noteReader: notes,
			provenanceRecorder: provenance,
			prepareExport,
			exportImageSources,
			fetchImage: fetchRemoteDataUrl,
			docxGenerator: async () => Buffer.from('docx'),
			pdfGenerator: async () => Buffer.from('pdf'),
			zipPacker: packZip,
			transactionRunner: new InMemoryTransactionRunner([artifacts, provenance]),
			...overrides
		})
	);
	return { service, library, artifacts, storage, notes, templates, exportSettings, provenance };
};

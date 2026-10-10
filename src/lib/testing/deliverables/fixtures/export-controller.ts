import { ExportSettingsRuleService } from '$lib/services/deliverables/settings';
import { ArtifactFileService } from '$lib/services/deliverables/artifact-files';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import {
	Deliverables,
	type DeliverablesDependencies
} from '$lib/server/controllers/deliverables/controller';
import { createArtifactServices } from '$lib/server/factories/capabilities/deliverable-storage-factory';
import { createTemplateServices } from '$lib/server/factories/capabilities/deliverable-storage-factory';
import {
	prepareExport,
	exportImageSources,
	exportDiagramReferences,
	exportWidgetReferences
} from '$lib/services/deliverables/export-preparation';
import { fetchRemoteDataUrl } from '$lib/server/repositories/deliverables/export-images';
import { DocumentBundleService } from '$lib/server/services/deliverables/bundle';
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
import { WidgetLibrary } from '$lib/server/services/widgets/library';
import { InMemoryWidgetRepository } from '$lib/testing/widgets/fakes/in-memory-widget-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryTodoRepository } from '$lib/testing/todos/fakes/in-memory-todo-repository';

export const exportControllerFixture = (overrides: Partial<DeliverablesDependencies> = {}) => {
	const artifacts = new InMemoryArtifactRepository();
	const storage = new InMemoryAttachmentStorage();
	const notes = new InMemoryNoteContent();
	const templates = new InMemoryTemplateRepository();
	const exportSettings = new InMemoryExportSettingsRepository();
	const provenance = new InMemoryProvenanceRecorder();
	const library = createArtifactServices(artifacts, exportSettings);
	const widgets = new InMemoryWidgetRepository();
	const todos = new InMemoryTodoRepository();
	const service = new Deliverables(
		capabilityDependencies<DeliverablesDependencies>({
			exportSettingsRules: new ExportSettingsRuleService(),
			artifactFiles: new ArtifactFileService(),
			...createTemplateServices(templates),
			artifactStorage: storage,
			artifactWriter: library.artifactWriter,
			artifactReader: library.artifactReader,
			artifactLister: library.artifactLister,
			artifactDeleter: library.artifactDeleter,
			exportSettingsReader: library.exportSettingsReader,
			exportSettingsWriter: library.exportSettingsWriter,
			noteReader: notes,
			provenanceRecorder: provenance,
			prepareExport,
			exportImageSources,
			exportDiagramReferences,
			exportWidgetReferences,
			widgetReader: new WidgetLibrary(
				widgets,
				new InMemoryProjectRepository(),
				new InMemoryNoteRepository()
			),
			todoLister: todos,
			noteLister: notes,
			fetchImage: fetchRemoteDataUrl,
			docxGenerator: async () => Buffer.from('docx'),
			pdfGenerator: async () => Buffer.from('pdf'),
			zipPacker: new DocumentBundleService(),
			transactionRunner: new InMemoryTransactionRunner([artifacts, provenance]),
			...overrides
		})
	);
	return {
		service,
		library,
		artifacts,
		storage,
		notes,
		templates,
		exportSettings,
		provenance,
		widgets,
		todos
	};
};

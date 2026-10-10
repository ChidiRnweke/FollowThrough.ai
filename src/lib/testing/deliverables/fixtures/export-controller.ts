import type { PreparedExport } from '$lib/models/deliverables';
import { createPdfRendering } from '$lib/server/factories/capabilities/pdf-rendering-factory';
import { InMemoryPdfDocument } from '$lib/testing/deliverables/fakes/pdf-document';
import {
	Deliverables,
	type DeliverablesDependencies
} from '$lib/server/controllers/deliverables/controller';
import {
	createArtifactServices,
	createTemplateServices
} from '$lib/server/factories/capabilities/deliverable-storage-factory';
import { fetchRemoteDataUrl } from '$lib/server/repositories/deliverables/export-images';
import { DocumentBundleService } from '$lib/server/services/deliverables/bundle';
import { WidgetLibrary } from '$lib/server/services/widgets/library';
import { ArtifactFileService } from '$lib/services/deliverables/artifact-files';
import { ExportPreparationService } from '$lib/services/deliverables/export-preparation';
import { ExportSettingsRuleService } from '$lib/services/deliverables/settings';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	InMemoryArtifactRepository,
	InMemoryAttachmentStorage,
	InMemoryTemplateRepository
} from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { InMemoryDocumentRenderer } from '$lib/testing/deliverables/fakes/document-renderer';
import { InMemoryExportSettingsRepository } from '$lib/testing/deliverables/fakes/in-memory-export-settings-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryTodoRepository } from '$lib/testing/todos/fakes/in-memory-todo-repository';
import { InMemoryWidgetRepository } from '$lib/testing/widgets/fakes/in-memory-widget-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';

type ExportOverrides = Omit<Partial<DeliverablesDependencies>, 'docxGenerator' | 'pdfGenerator'> & {
	docxGenerator?: DeliverablesDependencies['docxGenerator']['render'];
	pdfGenerator?: (input: PreparedExport) => Promise<Buffer>;
	pdfRendering?: DeliverablesDependencies['pdfGenerator'];
};
export const exportControllerFixture = (overrides: ExportOverrides = {}) => {
	const {
		docxGenerator = async () => Buffer.from('docx'),
		pdfGenerator = async () => Buffer.from('pdf'),
		pdfRendering,
		...dependencies
	} = overrides;
	const pdf = new InMemoryPdfDocument(pdfGenerator);
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
		new WorkspaceCommandRulesService(),
		capabilityDependencies<DeliverablesDependencies>({
			...agentToolResultsFixture(),
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
			prepareExport: new ExportPreparationService(),
			widgetReader: new WidgetLibrary(
				widgets,
				new InMemoryProjectRepository(),
				new InMemoryNoteRepository()
			),
			todoLister: todos,
			noteLister: notes,
			fetchImage: fetchRemoteDataUrl,
			docxGenerator: new InMemoryDocumentRenderer(docxGenerator),
			pdfGenerator: pdfRendering ?? { ...createPdfRendering(), preparation: pdf, writer: pdf },
			zipPacker: new DocumentBundleService(),
			transactionRunner: new InMemoryTransactionRunner([artifacts, provenance]),
			...dependencies
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

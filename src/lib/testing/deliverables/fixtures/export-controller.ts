import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { WidgetExportService } from '$lib/services/widgets/export-blocks';
import { WidgetSourceService } from '$lib/services/widgets/sources';
import { WidgetEvaluationService } from '$lib/services/widgets/edits';
import type { PreparedExport } from '$lib/models/deliverables';
import { InMemoryPdfRendering } from '$lib/testing/deliverables/fakes/pdf-document';
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
	const artifacts = new InMemoryArtifactRepository(testActor());
	const storage = new InMemoryAttachmentStorage();
	const notes = new InMemoryNoteContent(testActor());
	const templates = new InMemoryTemplateRepository(testActor());
	const exportSettings = new InMemoryExportSettingsRepository(testActor());
	const provenance = new InMemoryProvenanceRecorder(testActor());
	const library = createArtifactServices(artifacts, exportSettings);
	const widgets = new InMemoryWidgetRepository(testActor());
	const todos = new InMemoryTodoRepository(testActor());
	const service = new Deliverables(
		testActor(),
		new WorkspaceCommandRulesService(),
		capabilityDependencies<DeliverablesDependencies>({
			...agentToolResultsFixture(),
			exportSettingsRules: new ExportSettingsRuleService(),
			artifactFiles: new ArtifactFileService(),
			templateStore: createTemplateServices(testActor(), templates, testClock),
			artifactStorage: storage,
			artifactStore: library.artifactStore,
			exportSettings: library.exportSettings,
			noteReader: notes,
			provenanceRecorder: provenance,
			prepareExport: new ExportPreparationService(),
			widgetExports: new WidgetExportService(),
			widgetSources: new WidgetSourceService(),
			widgetEvaluation: new WidgetEvaluationService(),
			widgetReader: new WidgetLibrary(
				testActor(),
				widgets,
				new InMemoryProjectRepository(testActor()),
				new InMemoryNoteRepository(testActor())
			),
			todoLister: todos,
			noteLister: notes,
			fetchImage: fetchRemoteDataUrl,
			docxGenerator: new InMemoryDocumentRenderer(docxGenerator),
			pdfGenerator: pdfRendering ?? new InMemoryPdfRendering(pdfGenerator),
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

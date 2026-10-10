import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { DiagramLabelPresentationService } from '$lib/services/diagrams/labels';
import { DiagramEditingService } from '$lib/services/diagrams/editing';
import { DiagramLifecycleService } from '$lib/services/diagrams/trash';
import {
	DiagramStudio,
	type DiagramStudioDependencies
} from '$lib/server/controllers/diagram-studio/controller';
import { createDiagramServices } from '$lib/server/factories/capabilities/diagrams-capability-factory';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import {
	drawioBuilder,
	InMemoryDiagrams
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';

export const diagramRevisionFixture = () => {
	const sourceNotes = new InMemoryNoteContent();
	sourceNotes.notes = [noteBuilder()];
	const diagrams = new InMemoryDiagramRepository();
	const index = new InMemoryDiagrams();
	const library = createDiagramServices(
		diagrams,
		new InMemoryNoteRepository(),
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository(),
		new InMemoryProjectRepository()
	);
	const controller = new DiagramStudio(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<DiagramStudioDependencies>({
			diagramEditing: new DiagramEditingService(),
			diagramLifecycle: new DiagramLifecycleService(),
			diagramSourceNotes: sourceNotes,
			diagramFinder: library.finder,
			diagramDraftWriter: library.draftWriter,
			diagramRevisionReader: library.revisionReader,
			diagramTrash: library.lifecycle,
			now: () => drawioBuilder().createdAt,
			transactionRunner: new InMemoryTransactionRunner([diagrams, index]),
			diagramIndexer: index,
			drawioXmlValidator: { validate: (source) => source },
			diagramLabelPresentation: new DiagramLabelPresentationService(),
			drawioLabels: { read: () => ['labels'] },
			drawioSvgSanitizer: { sanitize: (svg) => svg }
		})
	);
	return { diagrams, controller, index };
};

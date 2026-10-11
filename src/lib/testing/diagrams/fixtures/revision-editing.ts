import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import {
	DiagramStudio,
	type DiagramStudioDependencies
} from '$lib/server/controllers/diagram-studio/controller';
import { DiagramLibraryService } from '$lib/server/services/diagrams/library';
import { DiagramRuleService } from '$lib/services/diagrams/editing';
import { DiagramLabelPresentationService } from '$lib/services/diagrams/labels';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	drawioBuilder,
	InMemoryDiagrams
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

export const diagramRevisionFixture = () => {
	const sourceNotes = new InMemoryNoteContent(testActor());
	sourceNotes.notes = [noteBuilder()];
	const diagrams = new InMemoryDiagramRepository(testActor());
	const index = new InMemoryDiagrams(testActor());
	const library = new DiagramLibraryService(
		testActor(),
		diagrams,
		new InMemoryNoteRepository(testActor()),
		new InMemoryAnchorRepository(testActor()),
		new InMemoryProvenanceRepository(testActor()),
		new InMemoryProjectRepository(testActor())
	);
	const controller = new DiagramStudio(
		testActor(),
		new WorkspaceCommandRulesService(),
		capabilityDependencies<DiagramStudioDependencies>({
			...agentToolResultsFixture(),
			diagramRules: new DiagramRuleService(),
			diagramSourceNotes: sourceNotes,
			diagrams: library,
			now: () => drawioBuilder().createdAt,
			transactionRunner: new InMemoryTransactionRunner([diagrams, index]),
			diagramIndexer: index,
			drawio: { validate: (source) => source, read: () => ['labels'], sanitize: (svg) => svg },
			diagramLabelPresentation: new DiagramLabelPresentationService()
		})
	);
	return { diagrams, controller, index };
};

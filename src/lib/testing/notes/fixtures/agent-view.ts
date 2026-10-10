import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import type { Note } from '$lib/models/notes';
import { NoteReadingService } from '$lib/server/services/notes/catalog';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { AgentToolPresentationService } from '$lib/server/services/agent/runs/tool-views';
import { agentFileReferencesFixture } from '$lib/testing/agent/fixtures/file-references';
import { createRelationshipServices } from '$lib/server/factories/capabilities/relationships-capability-factory';
import { createReferenceServices } from '$lib/server/factories/capabilities/references-capability-factory';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryUserPreferencesRepository } from '$lib/testing/identity/fakes/in-memory-user-preferences';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	InMemoryRelationshipRepository,
	InMemoryReferenceRepository,
	InMemoryDiagramRepository
} from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { InMemorySuggestionReader } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteBuilder, projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

export const agentNoteViewFixture = (note: Note = noteBuilder()) => {
	const notes = new InMemoryNoteRepository();
	notes.notes = [note];
	const projects = new InMemoryProjects();
	projects.projects = [projectBuilder()];
	const anchors = new InMemoryAnchorRepository();
	const provenance = new InMemoryProvenanceRepository();
	const graph = createRelationshipServices(
		new InMemoryRelationshipRepository(),
		notes,
		anchors,
		provenance
	);
	const library = createReferenceServices(
		new InMemoryReferenceRepository(),
		notes,
		anchors,
		provenance
	);
	const todos = new InMemoryTodos();
	const suggestions = new InMemorySuggestionReader();
	const fileReferences = agentFileReferencesFixture();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			fileReferences,
			agentPresentation: new AgentToolPresentationService(),
			noteReader: new NoteReadingService(notes, new InMemoryProjectRepository()),
			notePresentation: new NotePresentationService(),
			sections: new NoteSectionNumberingService(),
			projectReader: projects,
			userPreferences: new InMemoryUserPreferencesRepository(),
			relationshipFinder: graph.finder,
			backlinkContextReader: graph.contexts,
			referenceLister: library.lister,
			referenceContextReader: library.contexts,
			diagramLister: new InMemoryDiagramRepository(),
			todoLister: todos,
			todoContextReader: todos,
			suggestionLister: suggestions,
			suggestionExpirer: suggestions,
			suggestionContextReader: suggestions
		})
	);
	return { controller, notes, fileReferences };
};

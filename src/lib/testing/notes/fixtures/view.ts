import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createReferenceServices } from '$lib/server/factories/capabilities/references-capability-factory';
import { createRelationshipServices } from '$lib/server/factories/capabilities/relationships-capability-factory';
import { createSuggestionServices } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import { NoteArchiveImportService } from '$lib/server/services/notes/import';
import { NotePatchPreparationService } from '$lib/server/services/notes/patches';
import { NoteRevisionComparisonService } from '$lib/server/services/notes/revision-diff';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { ReferencePresentationService } from '$lib/services/references/presentation';
import { BacklinkPresentationService } from '$lib/services/relationships/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryUserPreferencesRepository } from '$lib/testing/identity/fakes/in-memory-user-preferences';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	InMemoryDiagramRepository,
	InMemoryReferenceRepository,
	InMemoryRelationshipRepository
} from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemorySuggestionRepository } from '$lib/testing/suggestions/fakes/in-memory-suggestion-repository';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteBuilder, projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

export const noteViewFixture = (note = noteBuilder()) => {
	const notes = new InMemoryNoteRepository();
	notes.notes = [note];
	const content = new InMemoryNoteContent();
	content.notes = notes.notes;
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
	const suggestions = createSuggestionServices(
		new InMemorySuggestionRepository(),
		notes,
		provenance,
		anchors
	);
	const controller = new Notes(
		new BacklinkPresentationService(),
		new ReferencePresentationService(),
		new WorkspaceCommandRulesService(),
		new ProvenancePresentationService(),
		capabilityDependencies<NotesDependencies>({
			...agentToolResultsFixture(),
			archiveImport: new NoteArchiveImportService(),
			patchPreparation: new NotePatchPreparationService(),
			revisionComparison: new NoteRevisionComparisonService(),
			todoPresentation: new TodoPresentationService(),
			textSearch: new NoteTextSearchService(),
			noteReferences: new NoteReferenceService(),
			sections: new NoteSectionNumberingService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteTrashRules: new NoteLifecycleRulesService(),
			notePublicationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
			noteReader: content,
			projectReader: projects,
			userPreferences: new InMemoryUserPreferencesRepository(),
			relationshipFinder: graph.finder,
			backlinkContextReader: graph.contexts,
			referenceLister: library.lister,
			referenceContextReader: library.contexts,
			diagramLister: new InMemoryDiagramRepository(),
			todoLister: todos,
			todoContextReader: todos,
			suggestionLister: suggestions.lister,
			suggestionExpirer: suggestions.expirer,
			suggestionContextReader: suggestions.context
		})
	);
	return { controller, notes, graph, library, todos };
};

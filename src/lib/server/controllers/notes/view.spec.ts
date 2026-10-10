import { createWorkspaceViews } from '$lib/factories/workspace/views';
import type { Url } from '$lib/models/references';
import {
	noteRecordSchema,
	projectRecordSchema,
	resourceDataSchemas,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import { createReferenceServices } from '$lib/server/factories/capabilities/references-capability-factory';
import { createRelationshipServices } from '$lib/server/factories/capabilities/relationships-capability-factory';
import { createSuggestionServices } from '$lib/server/factories/capabilities/suggestions-capability-factory';
import { NoteArchiveImportService } from '$lib/server/services/notes/import';
import { NotePatchPreparationService } from '$lib/server/services/notes/patches';
import { NoteRevisionComparisonService } from '$lib/server/services/notes/revision-diff';
import { SelectionOrigins } from '$lib/server/services/notes/selection-origin';
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
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';

describe('note view assembly', () => {
	it('assembles matching note details and proposal source context from downloaded and server records', async () => {
		const actor = testActor();
		const text = 'Review the architecture.';
		const note = noteBuilder({
			plainText: text,
			document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
		});
		const target = noteBuilder({ id: testNoteId(2), title: 'Related note' });
		const notes = new InMemoryNoteRepository();
		notes.notes = [note, target];
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
		const relationship = await graph.creator
			.createWithChange(actor, {
				sourceNoteId: note.id,
				targetNoteId: target.id,
				kind: 'mentions'
			})
			.then((change) => change.after);
		const reference = await library.creator.create(actor, {
			noteId: note.id,
			title: 'Source',
			url: 'https://example.com' as Url,
			tier: 'official',
			relevanceNote: 'Explains the note'
		});
		const todos = new InMemoryTodos();
		const suggestions = createSuggestionServices(
			new InMemorySuggestionRepository(),
			notes,
			provenance,
			anchors
		);
		const origins = new SelectionOrigins(notes, anchors, provenance);
		const source = await origins.resolve(actor, {
			noteId: note.id,
			revision: note.currentRevision,
			from: 0,
			to: note.plainText.length,
			text: note.plainText
		});
		const origin = await origins.record(actor, source, {
			producerKind: 'pipeline',
			producerName: 'Extract Promises',
			pipeline: 'extract_promises',
			metadata: {}
		});
		const proposal = await suggestions.creator.createFromSelection(actor, origin, {
			kind: 'todo',
			payload: { title: 'Review the architecture', responsibility: 'mine' }
		});
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
		const records = [
			{ type: 'suggestions', value: resourceDataSchemas.suggestions.parse(proposal) },
			{ type: 'provenance', value: resourceDataSchemas.provenance.parse(origin.provenance) },
			{ type: 'source_anchors', value: resourceDataSchemas.source_anchors.parse(origin.anchor) },
			...notes.notes.map((value) => ({
				type: 'notes' as const,
				value: noteRecordSchema.parse(value)
			})),
			{ type: 'projects', value: projectRecordSchema.parse(projects.projects[0]) },
			{
				type: 'note_relationships',
				value: resourceDataSchemas.note_relationships.parse(relationship)
			},
			{
				type: 'references',
				value: resourceDataSchemas.references.parse({ ...reference, projectId: note.projectId })
			}
		] satisfies WorkspaceRecord[];
		const downloaded = createWorkspaceViews(
			new Map(records.map((record) => [JSON.stringify([record.type, record.value.id]), record]))
		);
		expect(downloaded.note(note.id)?.view).toEqual(
			await controller.get(actor, { noteId: note.id })
		);
	});
});

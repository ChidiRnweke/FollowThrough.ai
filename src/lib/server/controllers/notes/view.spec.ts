import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { WorkspaceViews } from '$lib/controllers/workspace/views';
import {
	noteRecordSchema,
	projectRecordSchema,
	resourceDataSchemas,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import type { Url } from '$lib/models/references';
import { RelationshipGraph } from '$lib/server/services/relationships/graph';
import { ReferenceLibrary } from '$lib/server/services/references/library';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryUserPreferencesRepository } from '$lib/testing/identity/fakes/in-memory-user-preferences';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	InMemoryRelationshipRepository,
	InMemoryReferenceRepository,
	InMemoryDiagramRepository
} from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { InMemorySuggestionRepository } from '$lib/testing/suggestions/fakes/in-memory-suggestion-repository';
import { SuggestionInbox } from '$lib/server/services/suggestions/inbox';
import { SelectionOrigins } from '$lib/server/services/notes/selection-origin';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

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
		const graph = new RelationshipGraph(
			new InMemoryRelationshipRepository(),
			notes,
			anchors,
			provenance
		);
		const library = new ReferenceLibrary(
			new InMemoryReferenceRepository(),
			notes,
			anchors,
			provenance
		);
		const relationship = await graph.create(actor, {
			sourceNoteId: note.id,
			targetNoteId: target.id,
			kind: 'mentions'
		});
		const reference = await library.create(actor, {
			noteId: note.id,
			title: 'Source',
			url: 'https://example.com' as Url,
			tier: 'official',
			relevanceNote: 'Explains the note'
		});
		const todos = new InMemoryTodos();
		const suggestions = new SuggestionInbox(
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
		const proposal = await suggestions.createFromSelection(actor, origin, {
			kind: 'todo',
			payload: { title: 'Review the architecture', responsibility: 'mine' }
		});
		const controller = new Notes(
			capabilityDependencies<NotesDependencies>({
				noteReader: content,
				projectReader: projects,
				userPreferences: new InMemoryUserPreferencesRepository(),
				relationshipFinder: graph,
				backlinkViewAssembler: graph,
				referenceLister: library,
				referenceViewAssembler: library,
				diagramLister: new InMemoryDiagramRepository(),
				todoLister: todos,
				todoViewAssembler: todos,
				suggestionLister: suggestions,
				suggestionExpirer: suggestions,
				suggestionContextReader: suggestions
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
		const downloaded = new WorkspaceViews(
			new Map(records.map((record) => [JSON.stringify([record.type, record.value.id]), record]))
		);
		expect(downloaded.note(note.id)?.view).toEqual(
			await controller.get(actor, { noteId: note.id })
		);
	});
});

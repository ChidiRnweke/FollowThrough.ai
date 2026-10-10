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
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';

const setup = () => {
	const content = new InMemoryNoteContent();
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
			noteReader: content
		})
	);
	return { content, controller };
};

const twoNotes = (content: InMemoryNoteContent) => {
	content.notes = [
		noteBuilder({
			id: testNoteId(1),
			title: 'Kickoff',
			document: { type: 'doc', content: [{ type: 'paragraph' }] }
		}),
		noteBuilder({ id: testNoteId(2), title: 'Findings' })
	];
};

describe('Note document batch invariants', () => {
	it('returns a document per requested note, in the order asked for', async () => {
		const { content, controller } = setup();
		twoNotes(content);
		const documents = await controller.listDocuments(testActor(), {
			noteIds: [testNoteId(2), testNoteId(1)]
		});
		expect(documents.map((document) => document.title)).toEqual(['Findings', 'Kickoff']);
		expect(documents[1]?.document).toEqual({
			type: 'doc',
			content: [{ type: 'paragraph' }]
		});
	});

	it('reads nothing for an empty request', async () => {
		const { content, controller } = setup();
		twoNotes(content);
		expect(await controller.listDocuments(testActor(), { noteIds: [] })).toEqual([]);
	});

	it('returns every requested document beyond fifty in order', async () => {
		const { content, controller } = setup();
		content.notes = Array.from({ length: 51 }, (_, i) => noteBuilder({ id: testNoteId(i + 1) }));
		const ids = content.notes.map((note) => note.id).reverse();
		const documents = await controller.listDocuments(testActor(), { noteIds: ids });
		expect(documents.map((note) => note.id)).toEqual(ids);
	});
});

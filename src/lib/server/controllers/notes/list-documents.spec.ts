import { describe, expect, it } from 'vitest';
import { MAX_NOTE_DOCUMENTS } from '$lib/models/notes';
import { Notes, type NotesDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const content = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({ noteReader: content })
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
	});

	it('carries the body a caller needs to render the note', async () => {
		const { content, controller } = setup();
		twoNotes(content);
		const documents = await controller.listDocuments(testActor(), { noteIds: [testNoteId(1)] });
		expect(documents[0]?.document).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
	});

	it('reads nothing for an empty request', async () => {
		const { content, controller } = setup();
		twoNotes(content);
		expect(await controller.listDocuments(testActor(), { noteIds: [] })).toEqual([]);
	});

	it('rejects a batch past the cap rather than fanning out unboundedly', async () => {
		const { content, controller } = setup();
		twoNotes(content);
		await expect(
			controller.listDocuments(testActor(), {
				noteIds: Array.from({ length: MAX_NOTE_DOCUMENTS + 1 }, () => testNoteId(1))
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
});

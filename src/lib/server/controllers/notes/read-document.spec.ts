import { expect, it } from 'vitest';
import { noteViewFixture } from '$lib/testing/notes/fixtures/view';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

it('preserves missing-note failures when reading a note as a document file', async () => {
	const { controller } = noteViewFixture();
	await expect(controller.readDocument({ noteId: testNoteId(2) })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});
it('does not reveal another actor’s note ', async () => {
	const note = noteBuilder({ userId: testActor(2).userId });
	const { controller } = noteViewFixture(note);
	await expect(controller.readDocument({ noteId: note.id })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});

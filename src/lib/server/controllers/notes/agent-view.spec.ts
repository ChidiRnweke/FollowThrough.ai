import { expect, it } from 'vitest';
import { noteViewFixture } from '$lib/testing/notes/fixtures/view';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

it('preserves missing-note failures at the agent boundary', async () => {
	const { controller } = noteViewFixture();
	await expect(
		controller.agentGetNote(testActor(), { noteId: testNoteId(2) })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('does not reveal another actor’s note to the agent', async () => {
	const note = noteBuilder({ userId: testActor(2).userId });
	const { controller } = noteViewFixture(note);
	await expect(controller.agentGetNote(testActor(), { noteId: note.id })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});

import { expect, it } from 'vitest';
import { agentNoteViewFixture } from '$lib/testing/notes/fixtures/agent-view';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

it('projects the returned note snapshot with its Markdown file metadata', async () => {
	const note = noteBuilder({
		plainText: 'Unrelated search text',
		document: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The saved snapshot.' }] }]
		}
	});
	const { controller, fileReferences } = agentNoteViewFixture(note);
	const view = await controller.get(testActor(), { noteId: note.id });
	expect(await controller.getForAgent(testActor(), { noteId: note.id })).toEqual({
		noteId: note.id,
		title: note.title,
		etag: view.etag,
		body: { kind: 'file', file: fileReferences.describeNote(view.note) },
		backlinks: view.backlinks,
		references: view.references,
		diagrams: view.diagrams,
		todos: view.todos,
		pendingSuggestions: view.pendingSuggestions
	});
});
it('preserves missing-note failures at the agent boundary', async () => {
	const { controller } = agentNoteViewFixture();
	await expect(
		controller.getForAgent(testActor(), { noteId: testNoteId(2) })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('does not reveal another actor’s note to the agent', async () => {
	const note = noteBuilder({ userId: testActor(2).userId });
	const { controller } = agentNoteViewFixture(note);
	await expect(controller.getForAgent(testActor(), { noteId: note.id })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});

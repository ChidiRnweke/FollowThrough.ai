import { describe, expect, it } from 'vitest';
import { noteBuilder, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentToolPresentationService } from './tool-views';
const toolPresentation = new AgentToolPresentationService();

/**
 * The write path never got the treatment the read path did.
 *
 * `create_note` and its eight siblings returned `{ note: Note }` straight from the
 * controller, so every mutation shipped the whole ProseMirror `document` and its
 * `plainText` twin — and the replay virtualizer cannot catch it, because it sinks
 * *strings* over a threshold and a document is an object of many small ones. It rode in
 * replayed history for the rest of the conversation.
 *
 * The second consequence is the one a user sees: nested under `note`, the id sat one
 * level below where the transcript looks for it, so everything the agent created was
 * unreachable from the moment it said it had made it.
 */
describe('A write says what it made, and nothing else', () => {
	const note = noteBuilder({
		title: 'Solution design',
		currentRevision: 4,
		plainText: 'a very long body'
	});

	it('returns only the note receipt needed by the transcript', () => {
		const view = toolPresentation.projectNoteWrite(note);
		expect({
			noteId: view.noteId,
			document: 'document' in view,
			plainText: 'plainText' in view
		}).toEqual({ noteId: note.id, document: false, plainText: false });
	});

	it('does the same for a todo', () => {
		const todo = todoBuilder({ title: 'Renew certificates', status: 'open' });
		expect(toolPresentation.projectTodoWrite(todo).todoId).toBe(todo.id);
	});
});

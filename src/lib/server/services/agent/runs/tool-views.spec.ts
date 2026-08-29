import { describe, expect, it } from 'vitest';
import { projectNoteWrite, projectProject, projectTodoWrite } from './tool-views';

describe('agent tool views', () => {
	it('projects only stable project fields', () => {
		expect(projectProject({ id: 'p', name: 'Project' } as never)).toEqual({
			id: 'p',
			name: 'Project'
		});
	});
});

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
	const note = {
		id: 'note-1',
		title: 'Solution design',
		projectId: 'project-1',
		currentRevision: 4,
		document: { type: 'doc', content: [] },
		plainText: 'a very long body'
	} as never;

	it('carries the id at the top level, where the row looks for it', () => {
		expect(projectNoteWrite(note).noteId).toBe('note-1');
	});

	it('leaves the document off the wire', () => {
		expect('document' in projectNoteWrite(note)).toBe(false);
	});

	it('leaves the plain text off the wire', () => {
		expect('plainText' in projectNoteWrite(note)).toBe(false);
	});

	it('does the same for a todo', () => {
		const todo = { id: 'todo-1', title: 'Renew certificates', status: 'open' } as never;
		expect(projectTodoWrite(todo).todoId).toBe('todo-1');
	});
});

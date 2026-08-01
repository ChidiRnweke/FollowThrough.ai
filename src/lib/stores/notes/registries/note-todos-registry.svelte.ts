import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Todo, TodoView } from '$lib/models/todos';
import { Registry } from './registry';
import { NoteTodosStore } from '../note-todos.svelte';

/**
 * Per-note registry of `NoteTodosStore` instances.  Each mounted pane renders
 * TodoNode views anchored in its own note; an external mutation (e.g. a todo
 * created from the chat panel) is fanned out to whichever open note holds the
 * matching todo id via `applyTodoAcrossHeldStores`.
 */
export const noteTodosRegistry = new Registry<NoteId, NoteTodosStore>(() => new NoteTodosStore());

/**
 * Applies `todo` to the tray of every open note that already contains it.
 * Notes that do not hold the todo are left alone; the next navigation to them
 * will reload their inventory from the server.
 */
export function applyTodoAcrossHeldStores(todo: Todo): void {
	for (const noteId of noteTodosRegistry.heldKeys()) {
		const store = noteTodosRegistry.peek(noteId);
		if (store && store.get(todo.id)) store.apply(todo);
	}
}

export type { TodoView, Todo, ProjectId };

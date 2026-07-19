import type { NoteId } from '$lib/models';
import { Registry } from './registry';
import { NoteTodosStore } from '../note-todos.svelte';

/**
 * Per-note registry of `NoteTodosStore` instances.  Each mounted pane renders
 * TodoNode views anchored in its own note; an external mutation (e.g. a todo
 * created from the chat panel) is fanned out to whichever open note holds the
 * matching todo id via `applyTodoAcrossHeldStores`.
 */
export const noteTodosRegistry = new Registry<NoteId, NoteTodosStore>(() => new NoteTodosStore());

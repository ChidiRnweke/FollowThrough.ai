import type { NoteId, TextSelection } from '$lib/models';
import { Registry } from './registry';
import { EditorSelectionStore } from '../editor-selection.svelte';

/**
 * Per-note registry of `EditorSelectionStore` instances.  Each mounted pane
 * exposes its own selection; consumers that need "the active selection" (e.g.
 * the chat panel) read the focused pane's store via the workbench facade.
 */
export const editorSelectionRegistry = new Registry<NoteId, EditorSelectionStore>(
	() => new EditorSelectionStore()
);

export type { TextSelection };

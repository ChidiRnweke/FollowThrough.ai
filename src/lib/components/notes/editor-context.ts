import type { SuggestionView } from '$lib/models/suggestions';
import type { EditorSelectionState } from '$lib/stores/notes/editor-selection.svelte';

/** Shared projections and selection state for node views mounted outside the component tree. */
export interface PerNoteEditorSlot {
	readonly suggestions: readonly SuggestionView[];
	readonly selection: EditorSelectionState;
}

declare module '@tiptap/core' {
	interface Editor {
		perNote?: PerNoteEditorSlot;
	}
}

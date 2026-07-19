import type { NoteId } from '$lib/models';
import { Registry } from './registry';
import { SuggestionTrayStore } from '../suggestion-tray.svelte';

/**
 * Per-note registry of `SuggestionTrayStore` instances.  Each mounted pane
 * tracks its own pending suggestions; the right-panel suggestions list reads
 * the focused pane's tray through the workbench facade.
 */
export const suggestionTrayRegistry = new Registry<NoteId, SuggestionTrayStore>(
	() => new SuggestionTrayStore()
);

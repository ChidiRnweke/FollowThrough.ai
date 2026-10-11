import { SvelteSet } from 'svelte/reactivity';
import type { NoteId, SearchNoteTextInput, ReplaceNoteTextOutput } from '$lib/models/notes';

/** Mutable search inputs and pending work; the controller owns search and replacement. */
export class GlobalSearchStore {
	input = $state<SearchNoteTextInput>({ query: '', regex: false, caseSensitive: false });
	replacement = $state('');
	submitted = $state<SearchNoteTextInput | null>(null);
	searching = $state(false);
	searchError = $state<string | undefined>(undefined);
	lastReplace = $state<ReplaceNoteTextOutput | undefined>(undefined);
	readonly collapsedNoteIds = new SvelteSet<NoteId>();
	cancelTimer: (() => void) | undefined;
	setInput(input: SearchNoteTextInput): void {
		this.input = input;
	}
	setReplacement(value: string): void {
		this.replacement = value;
	}
	setTimer(cancel: (() => void) | undefined): void {
		this.cancelTimer = cancel;
	}
	setSearching(value: boolean): void {
		this.searching = value;
	}
	clearReplacement(): void {
		this.lastReplace = undefined;
	}
	submit(input: SearchNoteTextInput | null, error: string | undefined): void {
		this.submitted = input;
		this.searchError = error;
		this.searching = false;
	}
	completeReplacement(result: ReplaceNoteTextOutput | undefined, error: string | undefined): void {
		this.lastReplace = result;
		this.searchError = error;
	}
	setCollapsed(noteId: NoteId, collapsed: boolean): void {
		if (collapsed) this.collapsedNoteIds.add(noteId);
		else this.collapsedNoteIds.delete(noteId);
	}
}

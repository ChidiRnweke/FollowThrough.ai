import type { Note } from '$lib/models/notes';
import type { NoteWorkspaceState } from '$lib/controllers/notes/workspace';

/** Retained state of one mounted pane; all workflow decisions belong to its controller. */
export class NoteWorkspaceStore implements NoteWorkspaceState {
	private live = true;
	private buffer = $state<Note | null>(null);
	private publication = $state(false);
	private cancel: (() => void) | null = null;
	get active(): boolean {
		return this.live;
	}
	get note(): Note | null {
		return this.buffer;
	}
	get publishing(): boolean {
		return this.publication;
	}
	get cancelAutosave(): (() => void) | null {
		return this.cancel;
	}
	setNote(note: Note): void {
		this.buffer = note;
	}
	setPublishing(value: boolean): void {
		this.publication = value;
	}
	setAutosave(cancel: (() => void) | null): void {
		this.cancel = cancel;
	}
	release(): void {
		this.live = false;
	}
}

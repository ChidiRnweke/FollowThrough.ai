import type { NoteId } from '$lib/models/notes';

/** A reveal is a click's intent; if the note never mounts, it should not fire later. */
const REVEAL_TTL_MS = 15_000;

/**
 * A one-shot request to open a note at a specific plain-text range — global search
 * click-through. Kept out of the URL: `workbench.openTab` is URL-primary, and a reveal
 * is a transient intent, not shareable state. The note editor consumes the request for
 * its note id once it is ready, then clears it.
 */
/** A matched range in a note's `plainText`, as search reports it. */
export interface NoteRevealMatch {
	/** Half-open `[start, end)` offsets into the note's `plainText`. */
	readonly start: number;
	readonly end: number;
	/** The matched text, so the editor can re-anchor if unsaved edits shifted the offsets. */
	readonly text: string;
}

export interface NoteRevealRequest {
	readonly noteId: NoteId;
	/** The clicked match: selected and scrolled to. Half-open `[start, end)` into `plainText`. */
	readonly start: number;
	readonly end: number;
	readonly text: string;
	/** The note's other matches: lit alongside the clicked one, never selected or scrolled to. */
	readonly others: readonly NoteRevealMatch[];
	readonly requestedAt: number;
}

export class NoteRevealStore {
	pending = $state<NoteRevealRequest | undefined>(undefined);

	request(reveal: Omit<NoteRevealRequest, 'requestedAt'>): void {
		this.pending = { ...reveal, requestedAt: Date.now() };
	}

	/** Returns the pending request for `noteId` and clears it, so a reveal fires once. */
	consume(noteId: NoteId): NoteRevealRequest | undefined {
		const pending = this.pending;
		if (pending?.noteId !== noteId) return undefined;
		this.pending = undefined;
		if (Date.now() - pending.requestedAt > REVEAL_TTL_MS) return undefined;
		return pending;
	}
}

export const noteReveal = new NoteRevealStore();

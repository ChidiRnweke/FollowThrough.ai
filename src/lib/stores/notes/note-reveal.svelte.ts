import type { NoteId } from '$lib/models/notes';

/** A reveal is a click's intent; if the note never mounts, it should not fire later. */
const REVEAL_TTL_MS = 15_000;

/**
 * A one-shot request to open a note at a specific plain-text range — global search
 * click-through. Kept out of the URL: `workbench.openTab` is URL-primary, and a reveal
 * is a transient intent, not shareable state. The note editor consumes the request for
 * its note id once it is ready, then clears it.
 */
export interface NoteRevealRequest {
	readonly noteId: NoteId;
	/** Half-open `[start, end)` offsets into the note's `plainText`, as search reports them. */
	readonly start: number;
	readonly end: number;
	/** The matched text, so the editor can re-anchor if unsaved edits shifted the offsets. */
	readonly text: string;
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

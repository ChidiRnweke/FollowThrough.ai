import { SvelteMap } from 'svelte/reactivity';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { markCanvasShown, shouldOpenCanvas, type CanvasOpening } from './canvas-opening';

/**
 * Which canvas subject each conversation has already opened its canvas for.
 *
 * Held here rather than in the chat pane, for two reasons the rule in
 * `canvas-opening.ts` depends on. The pane cannot see the canvas being closed —
 * that happens in the pane beside it — so the "leave the current subject marked
 * as shown" half of the rule had nowhere to live and was never wired, and a
 * canvas the user closed sprang back. And component state dies with the
 * component, so remounting a pane made every subject unseen again.
 */
class CanvasOpenings {
	private readonly bySession = new SvelteMap<ChatSessionKey, CanvasOpening>();

	/** True when this conversation's canvas should open for what is on it now. */
	shouldOpen(sessionKey: ChatSessionKey, subjectKey: string | undefined): boolean {
		return shouldOpenCanvas(this.bySession.get(sessionKey) ?? {}, subjectKey);
	}

	/** Records a subject as shown — whether it was opened for, or dismissed. */
	markShown(sessionKey: ChatSessionKey, subjectKey: string | undefined): void {
		this.bySession.set(sessionKey, markCanvasShown(subjectKey));
	}

	/** Dropped with the session, so a reopened conversation opens its canvas again. */
	forget(sessionKey: ChatSessionKey): void {
		this.bySession.delete(sessionKey);
	}
}

export const canvasOpenings = new CanvasOpenings();

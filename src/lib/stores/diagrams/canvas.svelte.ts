import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { entryTools } from '$lib/stores/agent/chat.svelte';
import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
import { canvasSubject, type CanvasSubject } from '$lib/stores/diagrams/canvas-subject';
import { diagramTab, draftTab, type TabId } from '$lib/stores/workbench/tab-ref';

export interface SessionCanvas {
	/** What the conversation has put on the canvas, if anything. */
	readonly subject: CanvasSubject | undefined;
	/**
	 * The tab that shows it. A draft has no row of its own, so it is shown by the
	 * session's own canvas tab; a saved diagram is shown by its own tab, which is
	 * also what reopens with it.
	 */
	readonly tab: TabId | undefined;
}

const tabFor = (
	subject: CanvasSubject | undefined,
	sessionKey: ChatSessionKey
): TabId | undefined => {
	if (!subject) return undefined;
	return subject.kind === 'draft' ? draftTab(sessionKey) : diagramTab(subject.diagramId);
};

/**
 * The canvas for one chat session: what is on it and which tab shows it.
 *
 * One place, because there were three. The chat pane, the chat panel and the
 * draft pane each rebuilt this from the transcript, and the two that also mapped
 * the subject to a tab did it with the same seven lines copied character for
 * character — so "what the canvas is showing" could be answered three ways.
 *
 * Reading it out of the transcript rather than holding separate state is what
 * makes a reload or a reconnect show the same canvas: tool calls are replayed
 * with everything else.
 */
export const canvasFor = (sessionKey: ChatSessionKey): SessionCanvas => {
	const chat = chatRegistry.peek(sessionKey);
	const subject = canvasSubject((chat?.entries ?? []).flatMap((entry) => entryTools(entry)));
	return { subject, tab: tabFor(subject, sessionKey) };
};

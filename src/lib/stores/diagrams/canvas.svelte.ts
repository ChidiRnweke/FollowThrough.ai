import type { ConversationId } from '$lib/models/agent';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { entryTools } from '$lib/stores/agent/chat.svelte';
import { chatRegistry } from '$lib/stores/agent/registries/chat-registry.svelte';
import { canvasSubject, type CanvasSubject } from '$lib/stores/diagrams/canvas-subject';
import { findConversationDiagram } from '$lib/remote/diagrams/diagrams.remote';
import { diagramTab, draftTab, type TabId } from '$lib/stores/workbench/tab-ref';

/**
 * A canvas that has something on it.
 *
 * Neither field is optional, and the whole thing is absent instead. They only
 * ever varied together — `tab` was `undefined` exactly when `subject` was — so
 * two optionals stated one fact twice and every caller narrowed it twice to get
 * at either one.
 */
export interface SessionCanvas {
	/** What the conversation has put on the canvas. */
	readonly subject: CanvasSubject;
	/**
	 * The tab that shows it. A draft has no row of its own, so it is shown by the
	 * session's own canvas tab; a saved diagram is shown by its own tab, which is
	 * also what reopens with it.
	 */
	readonly tab: TabId;
}

const tabFor = (subject: CanvasSubject, sessionKey: ChatSessionKey): TabId =>
	subject.kind === 'draft' ? draftTab(sessionKey) : diagramTab(subject.diagramId);

/**
 * The canvas for one chat session, or nothing when the conversation has not
 * put anything on one.
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
export const canvasFor = (sessionKey: ChatSessionKey): SessionCanvas | undefined => {
	const chat = chatRegistry.peek(sessionKey);
	const subject = canvasSubject((chat?.entries ?? []).flatMap((entry) => entryTools(entry)));
	return subject ? { subject, tab: tabFor(subject, sessionKey) } : undefined;
};

/**
 * The tab a conversation's *kept* diagram would be shown in.
 *
 * `SessionCanvas.tab` cannot answer this. The canvas is read out of the
 * transcript, and keeping a draft does not rewrite the transcript — the
 * `present_diagram` call still says `draft`, so the canvas keeps naming
 * `draftTab(sessionKey)` long after `keep()` swapped that tab for the saved
 * diagram's. Anything asking "is the studio already open for this chat" has to
 * ask the row, not the transcript.
 *
 * Three arms rather than a tab beside a `ready` flag, for the reason
 * `keepIntent` spells out: a pair of fields makes
 * `{ ready: false, tab: … }` sayable, and leaves every caller re-deriving which
 * of the three cases it is out of two that do not mean anything apart.
 */
export type StudioTab =
	/** The lookup is still out. Not the same as having none, and must not act like it. */
	| { readonly kind: 'pending' }
	/** Asked and answered: this conversation has kept nothing. */
	| { readonly kind: 'unkept' }
	| { readonly kind: 'kept'; readonly tab: TabId };

const PENDING: StudioTab = { kind: 'pending' };
const UNKEPT: StudioTab = { kind: 'unkept' };

export const studioTabFor = (conversationId: ConversationId | undefined): StudioTab => {
	// A conversation with no id has sent nothing, so it can have kept nothing.
	// That is an answer, not a pending lookup.
	if (!conversationId) return UNKEPT;
	const found = findConversationDiagram(conversationId);
	if (!found.ready) return PENDING;
	const diagram = found.current.diagram;
	return diagram ? { kind: 'kept', tab: diagramTab(diagram.id) } : UNKEPT;
};

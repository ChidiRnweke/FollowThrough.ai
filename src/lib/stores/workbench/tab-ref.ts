import type { DiagramId } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';

/**
 * What a workbench tab holds.
 *
 * A tab used to *be* a `NoteId`, which is why `TabId` is a plain string alias
 * rather than a branded type: a note tab's id stays the bare uuid it always
 * was, so every URL already in a user's history, every persisted
 * `WorkspaceRecord` in IndexedDB, and every `data-project-tab` selector keeps
 * working with no migration. Only chat tabs carry a prefix; the single search
 * tab is the bare literal `search`, which no uuid can collide with.
 *
 * The safety lives in these helpers rather than in the type. Branding `TabId`
 * would buy nothing at runtime and would force a cast on nearly every line of
 * the workbench specs.
 */
export type TabId = string;

export type TabRef =
	| { readonly kind: 'note'; readonly noteId: NoteId }
	| { readonly kind: 'chat'; readonly sessionKey: ChatSessionKey }
	| { readonly kind: 'diagram'; readonly diagramId: DiagramId }
	| { readonly kind: 'draft'; readonly sessionKey: ChatSessionKey }
	| { readonly kind: 'search' };

const CHAT_PREFIX = 'chat:';

const DIAGRAM_PREFIX = 'diagram:';

/**
 * The canvas beside a studio conversation, before anything has been kept.
 *
 * Keyed by the chat session rather than by a diagram, because during drafting
 * there is no diagram: the draft lives in the transcript, and the canvas reads it
 * from there.
 */
const DRAFT_PREFIX = 'draft:';

/**
 * The one search tab's id. Unlike a chat there is never more than one global
 * search — its state lives in the `globalSearch` store, not behind a key — so
 * the tab id is a bare literal, the way a note tab is a bare uuid.
 */
export const SEARCH_TAB_ID = 'search';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: string): boolean => uuidRegex.test(value);

export const noteTab = (noteId: NoteId): TabId => noteId;

export const chatTab = (sessionKey: ChatSessionKey): TabId => `${CHAT_PREFIX}${sessionKey}`;

export const diagramTab = (diagramId: DiagramId): TabId => `${DIAGRAM_PREFIX}${diagramId}`;

export const draftTab = (sessionKey: ChatSessionKey): TabId => `${DRAFT_PREFIX}${sessionKey}`;

export const searchTab = (): TabId => SEARCH_TAB_ID;

/**
 * Reads a tab id, or `undefined` when it is neither a note uuid nor a chat
 * reference. Callers treat `undefined` as "drop this tab silently", which is
 * how a hand-edited URL degrades instead of erroring.
 */
export function parseTabId(raw: string): TabRef | undefined {
	const trimmed = raw.trim();
	if (trimmed === SEARCH_TAB_ID) return { kind: 'search' };
	if (trimmed.startsWith(CHAT_PREFIX)) {
		const sessionKey = trimmed.slice(CHAT_PREFIX.length);
		return isUuid(sessionKey) ? { kind: 'chat', sessionKey } : undefined;
	}
	if (trimmed.startsWith(DRAFT_PREFIX)) {
		const sessionKey = trimmed.slice(DRAFT_PREFIX.length);
		return isUuid(sessionKey) ? { kind: 'draft', sessionKey } : undefined;
	}
	if (trimmed.startsWith(DIAGRAM_PREFIX)) {
		const diagramId = trimmed.slice(DIAGRAM_PREFIX.length);
		return isUuid(diagramId) ? { kind: 'diagram', diagramId: diagramId as DiagramId } : undefined;
	}
	return isUuid(trimmed) ? { kind: 'note', noteId: trimmed as NoteId } : undefined;
}

export const isChatTab = (id: TabId): boolean => parseTabId(id)?.kind === 'chat';

export const isSearchTab = (id: TabId): boolean => parseTabId(id)?.kind === 'search';

export const isNoteTab = (id: TabId): boolean => parseTabId(id)?.kind === 'note';

export const isDiagramTab = (id: TabId): boolean => parseTabId(id)?.kind === 'diagram';

export const isDraftTab = (id: TabId): boolean => parseTabId(id)?.kind === 'draft';

/** The note behind a tab, or `undefined` for a chat tab. */
export function noteIdOf(id: TabId | undefined): NoteId | undefined {
	if (id === undefined) return undefined;
	const ref = parseTabId(id);
	return ref?.kind === 'note' ? ref.noteId : undefined;
}

/** The chat session behind a tab, or `undefined` for a note tab. */
export function chatKeyOf(id: TabId | undefined): ChatSessionKey | undefined {
	if (id === undefined) return undefined;
	const ref = parseTabId(id);
	return ref?.kind === 'chat' ? ref.sessionKey : undefined;
}

/** The diagram behind a tab, or `undefined` for any other kind. */
export function diagramIdOf(id: TabId | undefined): DiagramId | undefined {
	if (id === undefined) return undefined;
	const ref = parseTabId(id);
	return ref?.kind === 'diagram' ? ref.diagramId : undefined;
}

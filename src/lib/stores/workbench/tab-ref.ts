import type { NoteId } from '$lib/models/notes';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';

/**
 * What a workbench tab holds.
 *
 * A tab used to *be* a `NoteId`, which is why `TabId` is a plain string alias
 * rather than a branded type: a note tab's id stays the bare uuid it always
 * was, so every URL already in a user's history, every persisted
 * `WorkspaceRecord` in IndexedDB, and every `data-project-tab` selector keeps
 * working with no migration. Only chat tabs carry a prefix.
 *
 * The safety lives in these helpers rather than in the type. Branding `TabId`
 * would buy nothing at runtime and would force a cast on nearly every line of
 * the workbench specs.
 */
export type TabId = string;

export type TabRef =
	| { readonly kind: 'note'; readonly noteId: NoteId }
	| { readonly kind: 'chat'; readonly sessionKey: ChatSessionKey };

const CHAT_PREFIX = 'chat:';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: string): boolean => uuidRegex.test(value);

export const noteTab = (noteId: NoteId): TabId => noteId;

export const chatTab = (sessionKey: ChatSessionKey): TabId => `${CHAT_PREFIX}${sessionKey}`;

/**
 * Reads a tab id, or `undefined` when it is neither a note uuid nor a chat
 * reference. Callers treat `undefined` as "drop this tab silently", which is
 * how a hand-edited URL degrades instead of erroring.
 */
export function parseTabId(raw: string): TabRef | undefined {
	const trimmed = raw.trim();
	if (trimmed.startsWith(CHAT_PREFIX)) {
		const sessionKey = trimmed.slice(CHAT_PREFIX.length);
		return isUuid(sessionKey) ? { kind: 'chat', sessionKey } : undefined;
	}
	return isUuid(trimmed) ? { kind: 'note', noteId: trimmed as NoteId } : undefined;
}

export const isChatTab = (id: TabId): boolean => parseTabId(id)?.kind === 'chat';

export const isNoteTab = (id: TabId): boolean => parseTabId(id)?.kind === 'note';

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

import type { ContextResourceRef } from '$lib/models/agent';
import type { DiagramId } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import type { WidgetId } from '$lib/models/widgets';
import { type ChatSessionKey } from '$lib/models/chat';
import { SEARCH_TAB_ID, type TabId, type TabRef } from '$lib/models/workbench';
import type { WorkbenchTabReader } from '$lib/controllers/workbench/contracts';

export { SEARCH_TAB_ID } from '$lib/models/workbench';
export const noteTab = (noteId: NoteId): TabId => noteId;
export const chatTab = (sessionKey: ChatSessionKey): TabId => `chat:${sessionKey}`;
export const diagramTab = (diagramId: DiagramId): TabId => `diagram:${diagramId}`;
export const widgetTab = (widgetId: WidgetId): TabId => `widget:${widgetId}`;
export const searchTab = (): TabId => SEARCH_TAB_ID;

export type { TabId, TabRef } from '$lib/models/workbench';
const CHAT_PREFIX = 'chat:';
const DIAGRAM_PREFIX = 'diagram:';
const WIDGET_PREFIX = 'widget:';
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: string): boolean => uuidRegex.test(value);

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
	if (trimmed.startsWith(DIAGRAM_PREFIX)) {
		const diagramId = trimmed.slice(DIAGRAM_PREFIX.length);
		return isUuid(diagramId) ? { kind: 'diagram', diagramId: diagramId as DiagramId } : undefined;
	}
	if (trimmed.startsWith(WIDGET_PREFIX)) {
		const widgetId = trimmed.slice(WIDGET_PREFIX.length);
		return isUuid(widgetId) ? { kind: 'widget', widgetId: widgetId as WidgetId } : undefined;
	}
	return isUuid(trimmed) ? { kind: 'note', noteId: trimmed as NoteId } : undefined;
}

export const isChatTab = (id: TabId): boolean => parseTabId(id)?.kind === 'chat';

export const isSearchTab = (id: TabId): boolean => parseTabId(id)?.kind === 'search';

export const isNoteTab = (id: TabId): boolean => parseTabId(id)?.kind === 'note';

export const isDiagramTab = (id: TabId): boolean => parseTabId(id)?.kind === 'diagram';

export const isWidgetTab = (id: TabId): boolean => parseTabId(id)?.kind === 'widget';

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

/** The widget behind a tab, or `undefined` for any other kind. */
export function widgetIdOf(id: TabId | undefined): WidgetId | undefined {
	if (id === undefined) return undefined;
	const ref = parseTabId(id);
	return ref?.kind === 'widget' ? ref.widgetId : undefined;
}

/** The widget or diagram a tab shows, as chat context refers to it; `undefined` for other kinds. */
export function openResourceOf(
	id: TabId | undefined
): Extract<ContextResourceRef, { kind: 'widget' | 'diagram' }> | undefined {
	if (id === undefined) return undefined;
	const ref = parseTabId(id);
	if (ref?.kind === 'widget') return { kind: 'widget', id: ref.widgetId };
	if (ref?.kind === 'diagram') return { kind: 'diagram', id: ref.diagramId };
	return undefined;
}

export class BrowserWorkbenchTabReader implements WorkbenchTabReader {
	ref(id: TabId): TabRef | undefined {
		return parseTabId(id);
	}
	note(id: TabId): NoteId | undefined {
		return noteIdOf(id);
	}
	chat(id: TabId): ChatSessionKey | undefined {
		return chatKeyOf(id);
	}
}

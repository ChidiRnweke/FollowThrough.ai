import { chatKeyOf, diagramIdOf, isSearchTab, parseTabId, widgetIdOf, type TabId } from './tab-ref';
import type { WorkbenchUrlState } from '$lib/models/workbench';
import type { WorkbenchUrlCodec } from '$lib/controllers/workbench/contracts';

/**
 * Workbench URL model.
 *
 * The workbench shell is hosted by `(app)/+layout.svelte` whenever the URL
 * pathname matches a workbench route.  Tab state is serialised entirely in the
 * URL so that browser Back/Forward walks through focused tabs in the order the
 * user visited them, deep links survive reloads, and shareable URLs carry the
 * user's working set.
 *
 * Canonical URL shapes:
 *
 *   /notes/<focused>?tabs=<id>,<id>,<id>&split=<id>
 *   /chats/<conversation>?tabs=<id>,<id>&focus=chat:<key>&split=<id>
 *   /chats/new?tabs=chat:<key>&focus=chat:<key>
 *   /diagrams/<diagram>?tabs=<id>,<id>&focus=diagram:<diagram>&split=<id>
 *   /widgets/<widget>?tabs=<id>,<id>&focus=widget:<widget>&split=<id>
 *   /search?tabs=<id>,<id>&focus=search
 *
 * The focused tab is always also present in `?tabs=` (so the parameter
 * round-trips unambiguously).  The order of `?tabs=` is the visual tab order.
 *
 * A note-focused URL names its focused tab in the pathname, exactly as it
 * always has — every URL a user already has keeps working byte for byte.  A
 * chat-focused URL cannot, because its pathname carries a *conversation* id
 * (or `new`) rather than the client-minted session key the tab is keyed by, so
 * it names the focused tab in `?focus=` instead.  `?focus=` is therefore
 * emitted only when a chat or the search tab is focused — the two tabs a
 * pathname cannot name.
 *
 * `?split=<id>` optionally names a second tab that is rendered alongside the
 * focused pane for side-by-side reading.  The split pane is "context" — it
 * never holds the focused tab, and the sidebar continues to follow the focused
 * pane.  Closing the split (“`×`” on its pane) removes the parameter; the
 * underlying tab stays open in `?tabs=`.
 *
 * Field names still say `Note` because widening them would have spread this
 * change across every consumer in the shell for no behavioural gain; the values
 * are {@link TabId}s.
 */

export type { WorkbenchUrlState } from '$lib/models/workbench';
const TABS_PARAM = 'tabs';
const SPLIT_PARAM = 'split';
const FOCUS_PARAM = 'focus';

const isTabId = (value: string): boolean => parseTabId(value) !== undefined;

/**
 * The focused tab a pathname names, or `undefined` when it is not a workbench
 * route. `/chats/*` and `/search` defer to `?focus=`, since their pathnames
 * identify the host surface rather than the tab.
 */
function focusedFromPath(pathOnly: string, searchParams: URLSearchParams): TabId | undefined {
	const noteMatch = /^\/notes\/([0-9a-f-]{36})\/?$/i.exec(pathOnly);
	if (noteMatch) return isTabId(noteMatch[1]) ? noteMatch[1] : undefined;
	const diagramMatch = /^\/diagrams\/([0-9a-f-]{36})\/?$/i.exec(pathOnly);
	if (diagramMatch) {
		// A diagram's pathname *could* name its tab, but `?focus=` keeps one rule for
		// every non-note host and leaves `/diagrams/<id>` free to render as a plain
		// page when the workbench is not involved.
		const focusRaw = searchParams.get(FOCUS_PARAM);
		if (!focusRaw || diagramIdOf(focusRaw) === undefined) return undefined;
		return focusRaw;
	}
	const widgetMatch = /^\/widgets\/([0-9a-f-]{36})\/?$/i.exec(pathOnly);
	if (widgetMatch) {
		// As a diagram: without `?focus=` the widget renders as a plain page.
		const focusRaw = searchParams.get(FOCUS_PARAM);
		if (!focusRaw || widgetIdOf(focusRaw) === undefined) return undefined;
		return focusRaw;
	}
	if (/^\/search\/?$/.test(pathOnly)) {
		const focusRaw = searchParams.get(FOCUS_PARAM);
		if (!focusRaw || !isTabId(focusRaw)) return undefined;
		// The search host never names a note; anything else parseable goes through.
		return parseTabId(focusRaw)?.kind === 'note' ? undefined : focusRaw;
	}
	if (!/^\/chats\/(new|[0-9a-f-]{36})\/?$/i.test(pathOnly)) return undefined;
	const focusRaw = searchParams.get(FOCUS_PARAM);
	if (!focusRaw || chatKeyOf(focusRaw) === undefined) return undefined;
	return focusRaw;
}

/**
 * Extracts the workbench state from a URL.  Returns `undefined` for any URL
 * that is not a workbench path, so callers can treat other routes as a single,
 * well-defined "no tabs" case.
 */
export function parseWorkbenchUrl(
	pathname: string,
	searchParams: URLSearchParams
): WorkbenchUrlState | undefined {
	// SvelteKit's `page.url.pathname` is the path only, but the helper is also
	// convenient for tests and goto() targets that include the search string,
	// so we accept and strip a trailing `?...` defensively.
	const pathOnly = pathname.split('?')[0];
	const focused = focusedFromPath(pathOnly, searchParams);
	if (focused === undefined) return undefined;

	const tabsParam = searchParams.get(TABS_PARAM);
	if (!tabsParam) {
		const splitRaw = searchParams.get(SPLIT_PARAM);
		const splitId = splitRaw && isTabId(splitRaw) ? splitRaw : undefined;
		// `split` cannot be the focused pane itself; drop silently if so.
		const split = splitId && splitId !== focused ? splitId : undefined;
		return split
			? { focusedNoteId: focused, openTabs: [focused, split], splitNoteId: split }
			: { focusedNoteId: focused, openTabs: [focused] };
	}

	const parsed: TabId[] = [];
	for (const raw of tabsParam.split(',')) {
		const trimmed = raw.trim();
		if (!trimmed || !isTabId(trimmed)) continue;
		if (parsed.includes(trimmed)) continue;
		parsed.push(trimmed);
	}
	if (!parsed.includes(focused)) parsed.push(focused);

	const splitRaw = searchParams.get(SPLIT_PARAM);
	let split: TabId | undefined;
	if (splitRaw && isTabId(splitRaw)) {
		// Split must be an open tab (other than the focused one) to render
		// alongside the primary pane; otherwise it would be a tab with no
		// matching pane.  Drop silently.
		if (splitRaw !== focused && parsed.includes(splitRaw)) split = splitRaw;
	}
	return split
		? { focusedNoteId: focused, openTabs: parsed, splitNoteId: split }
		: { focusedNoteId: focused, openTabs: parsed };
}

/**
 * Serialises the workbench state into the URL that should replace the current
 * one.
 *
 * A chat-focused state needs the conversation the session is showing to build
 * its pathname; without one (a chat that has not been sent yet) it serialises
 * to `/chats/new`.
 */
export function serializeWorkbenchUrl(
	state: WorkbenchUrlState,
	options: { readonly conversationOf?: (sessionKey: string) => string | undefined } = {}
): string {
	const params: string[] = [];
	if (state.openTabs.length > 1) {
		params.push(`${TABS_PARAM}=${state.openTabs.map(encodeURIComponent).join(',')}`);
	}
	if (state.splitNoteId && state.splitNoteId !== state.focusedNoteId) {
		params.push(`${SPLIT_PARAM}=${encodeURIComponent(state.splitNoteId)}`);
	}
	const chatKey = chatKeyOf(state.focusedNoteId);
	if (chatKey !== undefined) {
		// A chat tab's pathname cannot name it, so `?focus=` does.
		params.push(`${FOCUS_PARAM}=${encodeURIComponent(state.focusedNoteId)}`);
		const conversationId = options.conversationOf?.(chatKey);
		const query = params.length > 0 ? `?${params.join('&')}` : '';
		return `/chats/${conversationId ?? 'new'}${query}`;
	}
	const diagramId = diagramIdOf(state.focusedNoteId);
	if (diagramId !== undefined) {
		// Same trick as a chat: the pathname names the host, `?focus=` the tab.
		params.push(`${FOCUS_PARAM}=${encodeURIComponent(state.focusedNoteId)}`);
		const query = params.length > 0 ? `?${params.join('&')}` : '';
		return `/diagrams/${diagramId}${query}`;
	}
	const widgetId = widgetIdOf(state.focusedNoteId);
	if (widgetId !== undefined) {
		params.push(`${FOCUS_PARAM}=${encodeURIComponent(state.focusedNoteId)}`);
		const query = params.length > 0 ? `?${params.join('&')}` : '';
		return `/widgets/${widgetId}${query}`;
	}
	if (isSearchTab(state.focusedNoteId)) {
		// Same trick as a chat: the `/search` pathname names the host, `?focus=` the tab.
		params.push(`${FOCUS_PARAM}=${encodeURIComponent(state.focusedNoteId)}`);
		const query = params.length > 0 ? `?${params.join('&')}` : '';
		return `/search${query}`;
	}
	const query = params.length > 0 ? `?${params.join('&')}` : '';
	return `/notes/${state.focusedNoteId}${query}`;
}

export class BrowserWorkbenchUrlCodec implements WorkbenchUrlCodec {
	parse(url: URL): WorkbenchUrlState | undefined {
		return parseWorkbenchUrl(url.pathname, url.searchParams);
	}
	serialize(state: WorkbenchUrlState, conversationId: string | undefined): string {
		return serializeWorkbenchUrl(state, { conversationOf: () => conversationId });
	}
}

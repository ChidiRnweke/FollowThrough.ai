import { chatKeyOf, isSearchTab, parseTabId, type TabId } from './tab-ref';

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

export interface WorkbenchUrlState {
	readonly focusedNoteId: TabId;
	readonly openTabs: readonly TabId[];
	/** Optional second pane rendered alongside the focused pane. */
	readonly splitNoteId?: TabId;
}

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
	if (isSearchTab(state.focusedNoteId)) {
		// Same trick as a chat: the `/search` pathname names the host, `?focus=` the tab.
		params.push(`${FOCUS_PARAM}=${encodeURIComponent(state.focusedNoteId)}`);
		const query = params.length > 0 ? `?${params.join('&')}` : '';
		return `/search${query}`;
	}
	const query = params.length > 0 ? `?${params.join('&')}` : '';
	return `/notes/${state.focusedNoteId}${query}`;
}

/**
 * Returns the next URL state when the user focuses a tab.
 *
 * If the user clicks the currently-split tab, the split is promoted to the
 * primary pane and the previous primary becomes the split — this preserves
 * the user's "read two notes side by side" context while letting them switch
 * which side they're editing.  Otherwise the split stays put (the user is
 * just switching top-of-mind note while reading the second).
 */
export function focusTabInState(state: WorkbenchUrlState, noteId: TabId): WorkbenchUrlState {
	if (state.focusedNoteId === noteId) return state;
	if (state.splitNoteId === noteId) {
		return {
			focusedNoteId: noteId,
			openTabs: state.openTabs,
			splitNoteId: state.focusedNoteId
		};
	}
	const openTabs = state.openTabs.includes(noteId) ? state.openTabs : [...state.openTabs, noteId];
	return {
		focusedNoteId: noteId,
		openTabs,
		...(state.splitNoteId ? { splitNoteId: state.splitNoteId } : {})
	};
}

/**
 * Returns the next URL state when the user opens a tab.  If the note is
 * already open it is simply focused; otherwise it is appended and focused.
 * Opening a brand-new note clears the split: the user is starting a fresh
 * primary context, and the previous compare surface is no longer relevant.
 */
export function openTabInState(
	state: WorkbenchUrlState | undefined,
	noteId: TabId
): WorkbenchUrlState {
	if (!state) return { focusedNoteId: noteId, openTabs: [noteId] };
	if (state.openTabs.includes(noteId)) return focusTabInState(state, noteId);
	return { focusedNoteId: noteId, openTabs: [...state.openTabs, noteId] };
}

/** Appends a note without disturbing the current focus, tab order, or split. */
export function addTabInBackgroundInState(
	state: WorkbenchUrlState | undefined,
	noteId: TabId
): WorkbenchUrlState {
	if (!state) return { focusedNoteId: noteId, openTabs: [noteId] };
	if (state.openTabs.includes(noteId)) return state;
	return {
		focusedNoteId: state.focusedNoteId,
		openTabs: [...state.openTabs, noteId],
		...(state.splitNoteId ? { splitNoteId: state.splitNoteId } : {})
	};
}

/**
 * Returns the next URL state when the user closes a tab.  If the closed tab
 * was focused, the next sibling (or, failing that, the most-recently-used
 * neighbour) becomes focused.  Returns `undefined` when the last tab is
 * closed — the caller should redirect away from `/notes/*`.
 */
export function closeTabInState(
	state: WorkbenchUrlState,
	noteId: TabId,
	options: { recentlyUsed?: readonly TabId[] } = {}
): WorkbenchUrlState | undefined {
	if (!state.openTabs.includes(noteId)) return state;
	const remaining = state.openTabs.filter((id) => id !== noteId);
	if (remaining.length === 0) return undefined;

	let nextFocused = state.focusedNoteId;
	if (nextFocused === noteId) {
		const closingIndex = state.openTabs.indexOf(noteId);
		const right = remaining[closingIndex];
		if (right) nextFocused = right;
		else nextFocused = remaining[remaining.length - 1];

		if (options.recentlyUsed) {
			for (let i = 0; i < options.recentlyUsed.length; i += 1) {
				const candidate = options.recentlyUsed[i];
				if (candidate === noteId) continue;
				if (remaining.includes(candidate)) {
					nextFocused = candidate;
					break;
				}
			}
		}
	}
	// If the closed tab was the split pane, drop the split.
	// If the closed tab was the primary and the split is still open, promote
	// the new focus and clear the split (the compare contrast is gone).
	const nextSplit: TabId | undefined =
		state.splitNoteId && state.splitNoteId !== noteId && nextFocused !== state.splitNoteId
			? state.splitNoteId
			: undefined;
	return {
		focusedNoteId: nextFocused,
		openTabs: remaining,
		...(nextSplit ? { splitNoteId: nextSplit } : {})
	};
}

/**
 * Returns the next URL state when the user closes several tabs at once (e.g.
 * "close all tabs of this project" / "close all tabs").  Focus and split
 * resolution mirror `closeTabInState`: a removed focus falls back to the
 * most-recently-used survivor, then the right neighbour, then the last
 * remaining tab.  Returns `undefined` when every tab is closed — the caller
 * should redirect away from `/notes/*`.
 */
export function closeTabsInState(
	state: WorkbenchUrlState,
	noteIds: readonly TabId[],
	options: { recentlyUsed?: readonly TabId[] } = {}
): WorkbenchUrlState | undefined {
	const closing = new Set<TabId>(noteIds);
	const remaining = state.openTabs.filter((id) => !closing.has(id));
	if (remaining.length === state.openTabs.length) return state;
	if (remaining.length === 0) return undefined;

	let nextFocused = state.focusedNoteId;
	if (closing.has(nextFocused)) {
		// Index of the right neighbour in `remaining`: the focused tab's index
		// minus the closed tabs that sat before it.
		const focusedIndex = state.openTabs.indexOf(state.focusedNoteId);
		const removedBefore = state.openTabs
			.slice(0, focusedIndex)
			.filter((id) => closing.has(id)).length;
		nextFocused = remaining[focusedIndex - removedBefore] ?? remaining[remaining.length - 1];

		if (options.recentlyUsed) {
			for (let i = 0; i < options.recentlyUsed.length; i += 1) {
				const candidate = options.recentlyUsed[i];
				if (closing.has(candidate)) continue;
				if (remaining.includes(candidate)) {
					nextFocused = candidate;
					break;
				}
			}
		}
	}
	// Drop the split if its tab was closed, or if it would collide with the
	// new focused pane (invariant: split ≠ focused).
	const nextSplit: TabId | undefined =
		state.splitNoteId && !closing.has(state.splitNoteId) && nextFocused !== state.splitNoteId
			? state.splitNoteId
			: undefined;
	return {
		focusedNoteId: nextFocused,
		openTabs: remaining,
		...(nextSplit ? { splitNoteId: nextSplit } : {})
	};
}

/**
 * Returns the next URL state when the user reorders tabs.  No-ops if either
 * id is unknown.
 */
export function moveTabInState(
	state: WorkbenchUrlState,
	from: TabId,
	to: TabId
): WorkbenchUrlState {
	if (from === to) return state;
	if (!state.openTabs.includes(from) || !state.openTabs.includes(to)) return state;
	const withoutFrom = state.openTabs.filter((id) => id !== from);
	const toIndex = withoutFrom.indexOf(to);
	const reordered = [...withoutFrom];
	reordered.splice(toIndex + 1, 0, from);
	return {
		focusedNoteId: state.focusedNoteId,
		openTabs: reordered,
		...(state.splitNoteId ? { splitNoteId: state.splitNoteId } : {})
	};
}

/**
 * Sets or clears the split pane id.  A note can't be split onto itself, so
 * passing `focusedNoteId` (or `undefined`) clears the split.  When `noteId`
 * isn't already in `openTabs`, it is appended so the resulting split pane
 * always has a matching tab in the strip.
 */
export function setSplitInState(
	state: WorkbenchUrlState,
	noteId: TabId | undefined
): WorkbenchUrlState {
	if (!noteId || noteId === state.focusedNoteId) {
		if (!state.splitNoteId) return state;
		return {
			focusedNoteId: state.focusedNoteId,
			openTabs: state.openTabs
		};
	}
	if (state.splitNoteId === noteId) return state;
	const openTabs = state.openTabs.includes(noteId) ? state.openTabs : [...state.openTabs, noteId];
	return { focusedNoteId: state.focusedNoteId, openTabs, splitNoteId: noteId };
}

import type { NoteId } from '$lib/models';

/**
 * Workbench URL model.
 *
 * The workbench shell is hosted by `(app)/+layout.svelte` whenever the URL
 * pathname matches `/notes/<id>`.  Tab state is serialised entirely in the
 * URL so that browser Back/Forward walks through focused tabs in the order the
 * user visited them, deep links survive reloads, and shareable URLs carry the
 * user's working set.
 *
 * Canonical URL shape:
 *
 *   /notes/<focused>?tabs=<id>,<id>,<id>&split=<id>
 *
 * The `<focused>` id is always also present in `?tabs=` (so the parameter
 * round-trips unambiguously).  The order of `?tabs=` is the visual tab order.
 *
 * `?split=<id>` optionally names a second tab that is rendered alongside the
 * focused pane for side-by-side reading.  The split pane is "context" — it
 * never holds `focusedNoteId`, and the right panel / chat / sidebar continue
 * to follow the focused pane.  Closing the split (“`×`” on its pane) removes
 * the parameter; the underlying tab stays open in `?tabs=`.
 */

export interface WorkbenchUrlState {
	readonly focusedNoteId: NoteId;
	readonly openTabs: readonly NoteId[];
	/** Optional second pane rendered alongside the focused pane. */
	readonly splitNoteId?: NoteId;
}

const TABS_PARAM = 'tabs';
const SPLIT_PARAM = 'split';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isNoteId = (value: string): value is NoteId => uuidRegex.test(value);

/**
 * Extracts the workbench state from a URL.  Returns `undefined` for any URL
 * that is not a `/notes/<id>` path, so callers can treat non-workbench routes
 * as a single, well-defined "no tabs" case.
 */
export function parseWorkbenchUrl(
	pathname: string,
	searchParams: URLSearchParams
): WorkbenchUrlState | undefined {
	// SvelteKit's `page.url.pathname` is the path only, but the helper is also
	// convenient for tests and goto() targets that include the search string,
	// so we accept and strip a trailing `?...` defensively.
	const pathOnly = pathname.split('?')[0];
	const match = /^\/notes\/([0-9a-f-]{36})\/?$/i.exec(pathOnly);
	if (!match) return undefined;
	const focused = match[1] as NoteId;
	if (!isNoteId(focused)) return undefined;

	const tabsParam = searchParams.get(TABS_PARAM);
	if (!tabsParam) {
		const splitRaw = searchParams.get(SPLIT_PARAM);
		const splitId = splitRaw && isNoteId(splitRaw) ? (splitRaw as NoteId) : undefined;
		// `split` cannot be the focused pane itself; drop silently if so.
		const split = splitId && splitId !== focused ? splitId : undefined;
		return split
			? { focusedNoteId: focused, openTabs: [focused, split], splitNoteId: split }
			: { focusedNoteId: focused, openTabs: [focused] };
	}

	const parsed: NoteId[] = [];
	for (const raw of tabsParam.split(',')) {
		const trimmed = raw.trim();
		if (!trimmed || !isNoteId(trimmed)) continue;
		if (parsed.includes(trimmed as NoteId)) continue;
		parsed.push(trimmed as NoteId);
	}
	if (!parsed.includes(focused)) parsed.push(focused);

	const splitRaw = searchParams.get(SPLIT_PARAM);
	let split: NoteId | undefined;
	if (splitRaw && isNoteId(splitRaw)) {
		const candidate = splitRaw as NoteId;
		// Split must be an open tab (other than the focused one) to render
		// alongside the primary pane; otherwise it would be a tab with no
		// matching pane.  Drop silently.
		if (candidate !== focused && parsed.includes(candidate)) split = candidate;
	}
	return split
		? { focusedNoteId: focused, openTabs: parsed, splitNoteId: split }
		: { focusedNoteId: focused, openTabs: parsed };
}

/**
 * Serialises the workbench state into the URL that should replace the current
 * one.  Returns `undefined` if the state is empty; callers should use this to
 * decide whether to clear the querystring entirely.
 */
export function serializeWorkbenchUrl(state: WorkbenchUrlState): string {
	const params: string[] = [];
	if (state.openTabs.length > 1) {
		params.push(`${TABS_PARAM}=${state.openTabs.map(encodeURIComponent).join(',')}`);
	}
	if (state.splitNoteId && state.splitNoteId !== state.focusedNoteId) {
		params.push(`${SPLIT_PARAM}=${encodeURIComponent(state.splitNoteId)}`);
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
export function focusTabInState(state: WorkbenchUrlState, noteId: NoteId): WorkbenchUrlState {
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
	noteId: NoteId
): WorkbenchUrlState {
	if (!state) return { focusedNoteId: noteId, openTabs: [noteId] };
	if (state.openTabs.includes(noteId)) return focusTabInState(state, noteId);
	return { focusedNoteId: noteId, openTabs: [...state.openTabs, noteId] };
}

/** Appends a note without disturbing the current focus, tab order, or split. */
export function addTabInBackgroundInState(
	state: WorkbenchUrlState | undefined,
	noteId: NoteId
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
	noteId: NoteId,
	options: { recentlyUsed?: readonly NoteId[] } = {}
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
	const nextSplit: NoteId | undefined =
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
 * Returns the next URL state when the user reorders tabs.  No-ops if either
 * id is unknown.
 */
export function moveTabInState(
	state: WorkbenchUrlState,
	from: NoteId,
	to: NoteId
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
	noteId: NoteId | undefined
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

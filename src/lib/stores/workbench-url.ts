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
 *   /notes/<focused>?tabs=<id>,<id>,<id>
 *
 * The `<focused>` id is always also present in `?tabs=` (so the parameter
 * round-trips unambiguously).  The order of `?tabs=` is the visual tab order.
 */

export interface WorkbenchUrlState {
	readonly focusedNoteId: NoteId;
	readonly openTabs: readonly NoteId[];
}

const TABS_PARAM = 'tabs';

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
	if (!tabsParam) return { focusedNoteId: focused, openTabs: [focused] };

	const parsed: NoteId[] = [];
	for (const raw of tabsParam.split(',')) {
		const trimmed = raw.trim();
		if (!trimmed || !isNoteId(trimmed)) continue;
		if (parsed.includes(trimmed as NoteId)) continue;
		parsed.push(trimmed as NoteId);
	}
	if (!parsed.includes(focused)) parsed.push(focused);
	return { focusedNoteId: focused, openTabs: parsed };
}

/**
 * Serialises the workbench state into the URL that should replace the current
 * one.  Returns `undefined` if the state is empty; callers should use this to
 * decide whether to clear the querystring entirely.
 */
export function serializeWorkbenchUrl(state: WorkbenchUrlState): string {
	const tabs =
		state.openTabs.length > 1
			? `?${TABS_PARAM}=${state.openTabs.map(encodeURIComponent).join(',')}`
			: '';
	return `/notes/${state.focusedNoteId}${tabs}`;
}

/**
 * Returns the next URL state when the user focuses a tab.
 */
export function focusTabInState(state: WorkbenchUrlState, noteId: NoteId): WorkbenchUrlState {
	if (state.focusedNoteId === noteId) return state;
	if (!state.openTabs.includes(noteId)) {
		return { focusedNoteId: noteId, openTabs: [...state.openTabs, noteId] };
	}
	return { focusedNoteId: noteId, openTabs: state.openTabs };
}

/**
 * Returns the next URL state when the user opens a tab.  If the note is
 * already open it is simply focused; otherwise it is appended and focused.
 */
export function openTabInState(
	state: WorkbenchUrlState | undefined,
	noteId: NoteId
): WorkbenchUrlState {
	if (!state) return { focusedNoteId: noteId, openTabs: [noteId] };
	if (state.openTabs.includes(noteId)) return focusTabInState(state, noteId);
	return { focusedNoteId: noteId, openTabs: [...state.openTabs, noteId] };
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
	return { focusedNoteId: nextFocused, openTabs: remaining };
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
	return { focusedNoteId: state.focusedNoteId, openTabs: reordered };
}

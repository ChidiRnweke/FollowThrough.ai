import type { TabId, WorkbenchUrlState } from '$lib/models/workbench';
/**
 * Returns the next URL state when the user focuses a tab.
 *
 * If the user clicks the currently-split tab, the split is promoted to the
 * primary pane and the previous primary becomes the split — this preserves
 * the user's "read two notes side by side" context while letting them switch
 * which side they're editing.  Otherwise the split stays put (the user is
 * just switching top-of-mind note while reading the second).
 */
function focusTabInState(state: WorkbenchUrlState, noteId: TabId): WorkbenchUrlState {
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
function openTabInState(state: WorkbenchUrlState | undefined, noteId: TabId): WorkbenchUrlState {
	if (!state) return { focusedNoteId: noteId, openTabs: [noteId] };
	if (state.openTabs.includes(noteId)) return focusTabInState(state, noteId);
	return { focusedNoteId: noteId, openTabs: [...state.openTabs, noteId] };
}

/** Appends a note without disturbing the current focus, tab order, or split. */
function addTabInBackgroundInState(
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
function closeTabInState(
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
function closeTabsInState(
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
function moveTabInState(state: WorkbenchUrlState, from: TabId, to: TabId): WorkbenchUrlState {
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
/**
 * Swap one open tab for another, in place.
 *
 * Promotion turns a studio draft into a saved diagram, and the pane showing it
 * has to change with it. Closing the draft and opening the diagram separately
 * would drop the split for a frame and leave a history entry for a studio that
 * lost its canvas, so the substitution happens as one transition — keeping the
 * tab's position, its focus and its side of the split.
 */
function replaceTabInState(state: WorkbenchUrlState, from: TabId, to: TabId): WorkbenchUrlState {
	if (from === to || !state.openTabs.includes(from)) return state;
	const openTabs = state.openTabs.includes(to)
		? state.openTabs.filter((id) => id !== from)
		: state.openTabs.map((id) => (id === from ? to : id));
	const focusedNoteId = state.focusedNoteId === from ? to : state.focusedNoteId;
	const splitNoteId = state.splitNoteId === from ? to : state.splitNoteId;
	return {
		focusedNoteId,
		openTabs,
		...(splitNoteId && splitNoteId !== focusedNoteId ? { splitNoteId } : {})
	};
}

function setSplitInState(state: WorkbenchUrlState, noteId: TabId | undefined): WorkbenchUrlState {
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

export interface WorkbenchTransitions {
	focusTab(state: WorkbenchUrlState, noteId: TabId): WorkbenchUrlState;
	openTab(state: WorkbenchUrlState | undefined, noteId: TabId): WorkbenchUrlState;
	addTabInBackground(state: WorkbenchUrlState | undefined, noteId: TabId): WorkbenchUrlState;
	closeTab(
		state: WorkbenchUrlState,
		noteId: TabId,
		options?: { recentlyUsed?: readonly TabId[] }
	): WorkbenchUrlState | undefined;
	closeTabs(
		state: WorkbenchUrlState,
		noteIds: readonly TabId[],
		options?: { recentlyUsed?: readonly TabId[] }
	): WorkbenchUrlState | undefined;
	moveTab(state: WorkbenchUrlState, from: TabId, to: TabId): WorkbenchUrlState;
	replaceTab(state: WorkbenchUrlState, from: TabId, to: TabId): WorkbenchUrlState;
	setSplit(state: WorkbenchUrlState, noteId: TabId | undefined): WorkbenchUrlState;
}
export class WorkbenchTransitionService implements WorkbenchTransitions {
	focusTab(state: WorkbenchUrlState, noteId: TabId): WorkbenchUrlState {
		return focusTabInState(state, noteId);
	}
	openTab(state: WorkbenchUrlState | undefined, noteId: TabId): WorkbenchUrlState {
		return openTabInState(state, noteId);
	}
	addTabInBackground(state: WorkbenchUrlState | undefined, noteId: TabId): WorkbenchUrlState {
		return addTabInBackgroundInState(state, noteId);
	}
	closeTab(
		state: WorkbenchUrlState,
		noteId: TabId,
		options: { recentlyUsed?: readonly TabId[] } = {}
	): WorkbenchUrlState | undefined {
		return closeTabInState(state, noteId, options);
	}
	closeTabs(
		state: WorkbenchUrlState,
		noteIds: readonly TabId[],
		options: { recentlyUsed?: readonly TabId[] } = {}
	): WorkbenchUrlState | undefined {
		return closeTabsInState(state, noteIds, options);
	}
	moveTab(state: WorkbenchUrlState, from: TabId, to: TabId): WorkbenchUrlState {
		return moveTabInState(state, from, to);
	}
	replaceTab(state: WorkbenchUrlState, from: TabId, to: TabId): WorkbenchUrlState {
		return replaceTabInState(state, from, to);
	}
	setSplit(state: WorkbenchUrlState, noteId: TabId | undefined): WorkbenchUrlState {
		return setSplitInState(state, noteId);
	}
}

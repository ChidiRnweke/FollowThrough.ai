import { describe, expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import {
	addTabInBackgroundInState,
	closeTabInState,
	closeTabsInState,
	focusTabInState,
	moveTabInState,
	openTabInState,
	parseWorkbenchUrl,
	serializeWorkbenchUrl,
	setSplitInState
} from './workbench-url';

const id = (n: number): NoteId =>
	`00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as NoteId;
const parse = (path: string, query = '') => parseWorkbenchUrl(path, new URLSearchParams(query));
const baseState = (
	focused: NoteId,
	...tabs: NoteId[]
): {
	focusedNoteId: NoteId;
	openTabs: NoteId[];
} => ({
	focusedNoteId: focused,
	openTabs: tabs.length ? tabs : [focused]
});

const state = baseState;

const splitState = (
	focused: NoteId,
	split: NoteId,
	...tabs: NoteId[]
): {
	focusedNoteId: NoteId;
	openTabs: NoteId[];
	splitNoteId: NoteId;
} => ({
	focusedNoteId: focused,
	openTabs: tabs.length ? tabs : [focused, split],
	splitNoteId: split
});

describe('parseWorkbenchUrl', () => {
	it('extracts focused and open tabs from a canonical URL', () => {
		const result = parse(`/notes/${id(1)}`, `tabs=${id(1)},${id(2)},${id(3)}`);
		expect(result).toEqual(state(id(1), id(1), id(2), id(3)));
	});

	it('returns undefined for non-workbench paths', () => {
		expect([parse('/today'), parse('/projects/abc'), parse('/')]).toEqual([
			undefined,
			undefined,
			undefined
		]);
	});

	it('injects the focused id into the tab list when missing', () => {
		const result = parse(`/notes/${id(1)}`, `tabs=${id(2)},${id(3)}`);
		expect(result).toEqual(state(id(1), id(2), id(3), id(1)));
	});

	it('drops unknown ids from tabs and ignores duplicates', () => {
		const result = parse(`/notes/${id(1)}`, `tabs=${id(1)},not-uuid,${id(2)},${id(1)}`);
		expect(result).toEqual(state(id(1), id(1), id(2)));
	});

	it('treats the path id alone as a single open tab', () => {
		const result = parse(`/notes/${id(1)}`);
		expect(result).toEqual(state(id(1)));
	});

	it('rejects malformed path ids', () => {
		expect(parse('/notes/not-a-uuid')).toBeUndefined();
	});

	it('ignores trailing slashes', () => {
		const result = parse(`/notes/${id(1)}/`);
		expect(result).toEqual(state(id(1)));
	});
});

describe('serializeWorkbenchUrl', () => {
	it('omits tabs query when only one tab is open', () => {
		expect(serializeWorkbenchUrl(state(id(1)))).toBe(`/notes/${id(1)}`);
	});

	it('serialises the tabs query when multiple tabs are open', () => {
		expect(serializeWorkbenchUrl(state(id(1), id(1), id(2), id(3)))).toBe(
			`/notes/${id(1)}?tabs=${id(1)},${id(2)},${id(3)}`
		);
	});

	it('serialises the split query alongside tabs when split is set', () => {
		expect(serializeWorkbenchUrl(splitState(id(1), id(2), id(1), id(2), id(3)))).toBe(
			`/notes/${id(1)}?tabs=${id(1)},${id(2)},${id(3)}&split=${id(2)}`
		);
	});

	it('omits split when split equals focused (invariant)', () => {
		expect(serializeWorkbenchUrl(state(id(1)))).toBe(`/notes/${id(1)}`);
	});

	it('round-trips through parseWorkbenchUrl', () => {
		const original = state(id(2), id(1), id(2), id(3));
		const url = serializeWorkbenchUrl(original);
		const [path, query = ''] = url.split('?');
		const reparsed = parse(path, query);
		expect(reparsed).toEqual(original);
	});

	it('round-trips split state through parseWorkbenchUrl', () => {
		const original = splitState(id(1), id(2), id(1), id(2), id(3));
		const url = serializeWorkbenchUrl(original);
		const [path, query = ''] = url.split('?');
		const reparsed = parse(path, query);
		expect(reparsed).toEqual(original);
	});
});

describe('parseWorkbenchUrl — split handling', () => {
	it('reads split alongside tabs', () => {
		const result = parse(`/notes/${id(1)}`, `tabs=${id(1)},${id(2)},${id(3)}&split=${id(3)}`);
		expect(result).toEqual(splitState(id(1), id(3), id(1), id(2), id(3)));
	});

	it('auto-adds the split id to openTabs when only the focused id was listed', () => {
		const result = parse(`/notes/${id(1)}`, `split=${id(2)}`);
		expect(result).toEqual(splitState(id(1), id(2)));
	});

	it('drops split when it equals the focused id', () => {
		const result = parse(`/notes/${id(1)}`, `tabs=${id(1)},${id(2)}&split=${id(1)}`);
		expect(result).toEqual(state(id(1), id(1), id(2)));
	});

	it('drops split when it is not in the open-tab list', () => {
		const result = parse(`/notes/${id(1)}`, `tabs=${id(1)},${id(2)}&split=${id(9)}`);
		expect(result).toEqual(state(id(1), id(1), id(2)));
	});

	it('drops split when it is not a valid note id', () => {
		const result = parse(`/notes/${id(1)}`, `tabs=${id(1)},${id(2)}&split=not-a-uuid`);
		expect(result).toEqual(state(id(1), id(1), id(2)));
	});
});

describe('focusTabInState', () => {
	it('is a no-op when focusing the current focused tab', () => {
		const s = state(id(1), id(1), id(2));
		expect(focusTabInState(s, id(1))).toBe(s);
	});

	it('keeps the tab order intact and only changes focus', () => {
		const s = state(id(1), id(1), id(2), id(3));
		expect(focusTabInState(s, id(3))).toEqual({
			focusedNoteId: id(3),
			openTabs: [id(1), id(2), id(3)]
		});
	});
});

describe('openTabInState', () => {
	it('returns a single-tab state when none was previously open', () => {
		expect(openTabInState(undefined, id(1))).toEqual(state(id(1)));
	});

	it('appends and focuses a brand new tab', () => {
		const s = state(id(1), id(1), id(2));
		expect(openTabInState(s, id(3))).toEqual({
			focusedNoteId: id(3),
			openTabs: [id(1), id(2), id(3)]
		});
	});

	it('focuses but does not duplicate an already-open tab', () => {
		const s = state(id(1), id(1), id(2));
		expect(openTabInState(s, id(2))).toEqual({
			focusedNoteId: id(2),
			openTabs: [id(1), id(2)]
		});
	});
});

describe('addTabInBackgroundInState', () => {
	it('creates and focuses the first tab without active workbench state', () => {
		expect(addTabInBackgroundInState(undefined, id(1))).toEqual(state(id(1)));
	});

	it('appends while preserving focus and split', () => {
		const s = splitState(id(1), id(2), id(1), id(2));
		expect(addTabInBackgroundInState(s, id(3))).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(2)
		});
	});

	it('returns the same state for a duplicate tab', () => {
		const s = splitState(id(1), id(2), id(1), id(2));
		expect(addTabInBackgroundInState(s, id(2))).toBe(s);
	});
});

describe('closeTabInState', () => {
	it('returns undefined when the last tab is closed', () => {
		expect(closeTabInState(state(id(1)), id(1))).toBeUndefined();
	});

	it('no-ops when the closed id is not open', () => {
		const s = state(id(1), id(1), id(2));
		expect(closeTabInState(s, id(3))).toBe(s);
	});

	it('focuses the right neighbour when the focused tab is closed', () => {
		const s = state(id(1), id(1), id(2), id(3));
		expect(closeTabInState(s, id(1))).toEqual(state(id(2), id(2), id(3)));
	});

	it('focuses the last tab when the focused tab is the rightmost', () => {
		const s = state(id(3), id(1), id(2), id(3));
		expect(closeTabInState(s, id(3))).toEqual(state(id(2), id(1), id(2)));
	});

	it('prefers the most-recently-used tab when supplied', () => {
		const s = state(id(1), id(1), id(2), id(3));
		const result = closeTabInState(s, id(1), { recentlyUsed: [id(3), id(2), id(1)] });
		expect(result?.focusedNoteId).toBe(id(3));
	});

	it('removes the closed id from the open list', () => {
		const s = state(id(1), id(1), id(2), id(3));
		const result = closeTabInState(s, id(2));
		expect(result?.openTabs).toEqual([id(1), id(3)]);
	});
});

describe('closeTabsInState', () => {
	it('returns undefined when every tab is closed', () => {
		const s = state(id(1), id(1), id(2));
		expect(closeTabsInState(s, [id(1), id(2)])).toBeUndefined();
	});

	it('no-ops when none of the ids are open', () => {
		const s = state(id(1), id(1), id(2));
		expect(closeTabsInState(s, [id(3), id(4)])).toBe(s);
	});

	it('keeps focus when the focused tab survives', () => {
		const s = state(id(1), id(1), id(2), id(3));
		expect(closeTabsInState(s, [id(2), id(3)])).toEqual(state(id(1), id(1)));
	});

	it('focuses the right neighbour of the closed run when the focused tab is closed', () => {
		const s = state(id(2), id(1), id(2), id(3), id(4));
		expect(closeTabsInState(s, [id(2), id(3)])).toEqual(state(id(4), id(1), id(4)));
	});

	it('skips over closed tabs before the focused one when picking the neighbour', () => {
		const s = state(id(3), id(1), id(2), id(3), id(4));
		expect(closeTabsInState(s, [id(1), id(3)])).toEqual(state(id(4), id(2), id(4)));
	});

	it('focuses the last tab when the closed run reaches the right edge', () => {
		const s = state(id(3), id(1), id(2), id(3));
		expect(closeTabsInState(s, [id(2), id(3)])).toEqual(state(id(1), id(1)));
	});

	it('prefers the most-recently-used survivor when supplied', () => {
		const s = state(id(2), id(1), id(2), id(3), id(4));
		const result = closeTabsInState(s, [id(2), id(3)], {
			recentlyUsed: [id(2), id(1), id(4)]
		});
		expect(result?.focusedNoteId).toBe(id(1));
	});

	it('drops the split when the split tab is closed', () => {
		const s = splitState(id(1), id(3), id(1), id(2), id(3));
		expect(closeTabsInState(s, [id(3)])).toEqual(state(id(1), id(1), id(2)));
	});

	it('keeps the split when it survives and does not collide with focus', () => {
		const s = splitState(id(1), id(3), id(1), id(2), id(3));
		const result = closeTabsInState(s, [id(2)]);
		expect(result).toEqual(splitState(id(1), id(3), id(1), id(3)));
	});
});

describe('moveTabInState', () => {
	it('no-ops when either id is unknown', () => {
		const s = state(id(1), id(1), id(2));
		expect(moveTabInState(s, id(1), id(9))).toBe(s);
	});

	it('moves a tab to the right of the target', () => {
		const s = state(id(1), id(1), id(2), id(3));
		expect(moveTabInState(s, id(3), id(1))).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(3), id(2)]
		});
	});

	it('preserves focus when the focused tab is not the one moved', () => {
		const s = state(id(2), id(1), id(2), id(3));
		const result = moveTabInState(s, id(1), id(3));
		expect(result?.focusedNoteId).toBe(id(2));
	});

	it('preserves the split id when reordering does not involve it', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = moveTabInState(s, id(3), id(1));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(3), id(2)],
			splitNoteId: id(2)
		});
	});
});

describe('setSplitInState', () => {
	it('opens a split by appending the id when not already open', () => {
		const s = state(id(1), id(1), id(2));
		const result = setSplitInState(s, id(3));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(3)
		});
	});

	it('opens a split using an already-open id without duplicating', () => {
		const s = state(id(1), id(1), id(2), id(3));
		const result = setSplitInState(s, id(3));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(3)
		});
	});

	it('is a no-op when the split id is already the active split', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		expect(setSplitInState(s, id(2))).toBe(s);
	});

	it('clears the split when called with undefined', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = setSplitInState(s, undefined);
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)]
		});
	});

	it('clears the split when called with the focused id', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = setSplitInState(s, id(1));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)]
		});
	});

	it('is a no-op when no split exists and undefined is passed', () => {
		const s = state(id(1), id(1), id(2));
		expect(setSplitInState(s, undefined)).toBe(s);
	});

	it('is a no-op when no split exists and the focused id is passed', () => {
		const s = state(id(1), id(1), id(2));
		expect(setSplitInState(s, id(1))).toBe(s);
	});

	it('switches the pane being shown as split when called with a different open id', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = setSplitInState(s, id(3));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(3)
		});
	});
});

describe('focusTabInState — split interactions', () => {
	it('promotes the split to primary (and previous primary to split) when focused', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = focusTabInState(s, id(2));
		expect(result).toEqual({
			focusedNoteId: id(2),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(1)
		});
	});

	it('keeps the split intact when focusing a third tab', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = focusTabInState(s, id(3));
		expect(result).toEqual({
			focusedNoteId: id(3),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(2)
		});
	});

	it('appends a brand new id to openTabs while preserving the split', () => {
		const s = splitState(id(1), id(2), id(1), id(2));
		const result = focusTabInState(s, id(3));
		expect(result).toEqual({
			focusedNoteId: id(3),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(2)
		});
	});
});

describe('closeTabInState — split interactions', () => {
	it('clears the split when the split tab is closed', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = closeTabInState(s, id(2));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(3)]
		});
	});

	it('clears the split when the focused tab is closed and the split becomes focused', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = closeTabInState(s, id(1));
		// Right-neighbour is id(2); split must clear since id(2) becomes focused.
		expect(result).toEqual({
			focusedNoteId: id(2),
			openTabs: [id(2), id(3)]
		});
	});

	it('keeps the split when a third tab is closed and the split is unaffected', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = closeTabInState(s, id(3));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2)],
			splitNoteId: id(2)
		});
	});
});

describe('openTabInState — split interactions', () => {
	it('clears the split when opening a brand new tab', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = openTabInState(s, id(4));
		expect(result).toEqual({
			focusedNoteId: id(4),
			openTabs: [id(1), id(2), id(3), id(4)]
		});
	});

	it('focuses (and may promote) when the id is already open', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		// Opening the split id should promote: focused becomes id(2), split becomes id(1)
		const result = openTabInState(s, id(2));
		expect(result).toEqual({
			focusedNoteId: id(2),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(1)
		});
	});
});

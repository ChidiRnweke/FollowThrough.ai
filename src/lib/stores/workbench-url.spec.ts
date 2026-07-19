import { describe, expect, it } from 'vitest';
import type { NoteId } from '$lib/models';
import {
	closeTabInState,
	focusTabInState,
	moveTabInState,
	openTabInState,
	parseWorkbenchUrl,
	serializeWorkbenchUrl
} from './workbench-url';

const id = (n: number): NoteId =>
	`00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as NoteId;
const parse = (path: string, query = '') => parseWorkbenchUrl(path, new URLSearchParams(query));
const state = (focused: NoteId, ...tabs: NoteId[]) => ({
	focusedNoteId: focused,
	openTabs: tabs.length ? tabs : [focused]
});

describe('parseWorkbenchUrl', () => {
	it('extracts focused and open tabs from a canonical URL', () => {
		const result = parse(`/notes/${id(1)}`, `tabs=${id(1)},${id(2)},${id(3)}`);
		expect(result).toEqual(state(id(1), id(1), id(2), id(3)));
	});

	it('returns undefined for non-workbench paths', () => {
		expect(parse('/today')).toBeUndefined();
		expect(parse('/projects/abc')).toBeUndefined();
		expect(parse('/')).toBeUndefined();
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

	it('round-trips through parseWorkbenchUrl', () => {
		const original = state(id(2), id(1), id(2), id(3));
		const url = serializeWorkbenchUrl(original);
		const [path, query = ''] = url.split('?');
		const reparsed = parse(path, query);
		expect(reparsed).toEqual(original);
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
});

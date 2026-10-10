import { describe, expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import { WorkbenchTransitionService } from '$lib/services/workbench/transitions';
const transitions = new WorkbenchTransitionService();

const id = (n: number): NoteId =>
	`00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as NoteId;

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

describe('focusTabInState', () => {
	it('is a no-op when focusing the current focused tab', () => {
		const s = state(id(1), id(1), id(2));
		expect(transitions.focusTab(s, id(1))).toBe(s);
	});

	it('keeps the tab order intact and only changes focus', () => {
		const s = state(id(1), id(1), id(2), id(3));
		expect(transitions.focusTab(s, id(3))).toEqual({
			focusedNoteId: id(3),
			openTabs: [id(1), id(2), id(3)]
		});
	});
});

describe('openTabInState', () => {
	it('returns a single-tab state when none was previously open', () => {
		expect(transitions.openTab(undefined, id(1))).toEqual(state(id(1)));
	});

	it('appends and focuses a brand new tab', () => {
		const s = state(id(1), id(1), id(2));
		expect(transitions.openTab(s, id(3))).toEqual({
			focusedNoteId: id(3),
			openTabs: [id(1), id(2), id(3)]
		});
	});

	it('focuses but does not duplicate an already-open tab', () => {
		const s = state(id(1), id(1), id(2));
		expect(transitions.openTab(s, id(2))).toEqual({
			focusedNoteId: id(2),
			openTabs: [id(1), id(2)]
		});
	});
});

describe('addTabInBackgroundInState', () => {
	it('creates and focuses the first tab without active workbench state', () => {
		expect(transitions.addTabInBackground(undefined, id(1))).toEqual(state(id(1)));
	});

	it('appends while preserving focus and split', () => {
		const s = splitState(id(1), id(2), id(1), id(2));
		expect(transitions.addTabInBackground(s, id(3))).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(2)
		});
	});

	it('returns the same state for a duplicate tab', () => {
		const s = splitState(id(1), id(2), id(1), id(2));
		expect(transitions.addTabInBackground(s, id(2))).toBe(s);
	});
});

describe('closeTabInState', () => {
	it('returns undefined when the last tab is closed', () => {
		expect(transitions.closeTab(state(id(1)), id(1))).toBeUndefined();
	});

	it('no-ops when the closed id is not open', () => {
		const s = state(id(1), id(1), id(2));
		expect(transitions.closeTab(s, id(3))).toBe(s);
	});

	it('focuses the right neighbour when the focused tab is closed', () => {
		const s = state(id(1), id(1), id(2), id(3));
		expect(transitions.closeTab(s, id(1))).toEqual(state(id(2), id(2), id(3)));
	});

	it('focuses the last tab when the focused tab is the rightmost', () => {
		const s = state(id(3), id(1), id(2), id(3));
		expect(transitions.closeTab(s, id(3))).toEqual(state(id(2), id(1), id(2)));
	});

	it('prefers the most-recently-used tab when supplied', () => {
		const s = state(id(1), id(1), id(2), id(3));
		const result = transitions.closeTab(s, id(1), { recentlyUsed: [id(3), id(2), id(1)] });
		expect(result?.focusedNoteId).toBe(id(3));
	});

	it('removes the closed id from the open list', () => {
		const s = state(id(1), id(1), id(2), id(3));
		const result = transitions.closeTab(s, id(2));
		expect(result?.openTabs).toEqual([id(1), id(3)]);
	});
});

describe('closeTabsInState', () => {
	it('returns undefined when every tab is closed', () => {
		const s = state(id(1), id(1), id(2));
		expect(transitions.closeTabs(s, [id(1), id(2)])).toBeUndefined();
	});

	it('no-ops when none of the ids are open', () => {
		const s = state(id(1), id(1), id(2));
		expect(transitions.closeTabs(s, [id(3), id(4)])).toBe(s);
	});

	it('keeps focus when the focused tab survives', () => {
		const s = state(id(1), id(1), id(2), id(3));
		expect(transitions.closeTabs(s, [id(2), id(3)])).toEqual(state(id(1), id(1)));
	});

	it('focuses the right neighbour of the closed run when the focused tab is closed', () => {
		const s = state(id(2), id(1), id(2), id(3), id(4));
		expect(transitions.closeTabs(s, [id(2), id(3)])).toEqual(state(id(4), id(1), id(4)));
	});

	it('skips over closed tabs before the focused one when picking the neighbour', () => {
		const s = state(id(3), id(1), id(2), id(3), id(4));
		expect(transitions.closeTabs(s, [id(1), id(3)])).toEqual(state(id(4), id(2), id(4)));
	});

	it('focuses the last tab when the closed run reaches the right edge', () => {
		const s = state(id(3), id(1), id(2), id(3));
		expect(transitions.closeTabs(s, [id(2), id(3)])).toEqual(state(id(1), id(1)));
	});

	it('prefers the most-recently-used survivor when supplied', () => {
		const s = state(id(2), id(1), id(2), id(3), id(4));
		const result = transitions.closeTabs(s, [id(2), id(3)], {
			recentlyUsed: [id(2), id(1), id(4)]
		});
		expect(result?.focusedNoteId).toBe(id(1));
	});

	it('drops the split when the split tab is closed', () => {
		const s = splitState(id(1), id(3), id(1), id(2), id(3));
		expect(transitions.closeTabs(s, [id(3)])).toEqual(state(id(1), id(1), id(2)));
	});

	it('keeps the split when it survives and does not collide with focus', () => {
		const s = splitState(id(1), id(3), id(1), id(2), id(3));
		const result = transitions.closeTabs(s, [id(2)]);
		expect(result).toEqual(splitState(id(1), id(3), id(1), id(3)));
	});
});

describe('moveTabInState', () => {
	it('no-ops when either id is unknown', () => {
		const s = state(id(1), id(1), id(2));
		expect(transitions.moveTab(s, id(1), id(9))).toBe(s);
	});

	it('moves a tab to the right of the target', () => {
		const s = state(id(1), id(1), id(2), id(3));
		expect(transitions.moveTab(s, id(3), id(1))).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(3), id(2)]
		});
	});

	it('preserves focus when the focused tab is not the one moved', () => {
		const s = state(id(2), id(1), id(2), id(3));
		const result = transitions.moveTab(s, id(1), id(3));
		expect(result?.focusedNoteId).toBe(id(2));
	});

	it('preserves the split id when reordering does not involve it', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = transitions.moveTab(s, id(3), id(1));
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
		const result = transitions.setSplit(s, id(3));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(3)
		});
	});

	it('opens a split using an already-open id without duplicating', () => {
		const s = state(id(1), id(1), id(2), id(3));
		const result = transitions.setSplit(s, id(3));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(3)
		});
	});

	it('is a no-op when the split id is already the active split', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		expect(transitions.setSplit(s, id(2))).toBe(s);
	});

	it('clears the split when called with undefined', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = transitions.setSplit(s, undefined);
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)]
		});
	});

	it('clears the split when called with the focused id', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = transitions.setSplit(s, id(1));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(2), id(3)]
		});
	});

	it('is a no-op when no split exists and undefined is passed', () => {
		const s = state(id(1), id(1), id(2));
		expect(transitions.setSplit(s, undefined)).toBe(s);
	});

	it('is a no-op when no split exists and the focused id is passed', () => {
		const s = state(id(1), id(1), id(2));
		expect(transitions.setSplit(s, id(1))).toBe(s);
	});

	it('switches the pane being shown as split when called with a different open id', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = transitions.setSplit(s, id(3));
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
		const result = transitions.focusTab(s, id(2));
		expect(result).toEqual({
			focusedNoteId: id(2),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(1)
		});
	});

	it('keeps the split intact when focusing a third tab', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = transitions.focusTab(s, id(3));
		expect(result).toEqual({
			focusedNoteId: id(3),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(2)
		});
	});

	it('appends a brand new id to openTabs while preserving the split', () => {
		const s = splitState(id(1), id(2), id(1), id(2));
		const result = transitions.focusTab(s, id(3));
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
		const result = transitions.closeTab(s, id(2));
		expect(result).toEqual({
			focusedNoteId: id(1),
			openTabs: [id(1), id(3)]
		});
	});

	it('clears the split when the focused tab is closed and the split becomes focused', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = transitions.closeTab(s, id(1));
		// Right-neighbour is id(2); split must clear since id(2) becomes focused.
		expect(result).toEqual({
			focusedNoteId: id(2),
			openTabs: [id(2), id(3)]
		});
	});

	it('keeps the split when a third tab is closed and the split is unaffected', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		const result = transitions.closeTab(s, id(3));
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
		const result = transitions.openTab(s, id(4));
		expect(result).toEqual({
			focusedNoteId: id(4),
			openTabs: [id(1), id(2), id(3), id(4)]
		});
	});

	it('focuses (and may promote) when the id is already open', () => {
		const s = splitState(id(1), id(2), id(1), id(2), id(3));
		// Opening the split id should promote: focused becomes id(2), split becomes id(1)
		const result = transitions.openTab(s, id(2));
		expect(result).toEqual({
			focusedNoteId: id(2),
			openTabs: [id(1), id(2), id(3)],
			splitNoteId: id(1)
		});
	});
});

describe('replacing one tab with another', () => {
	const DRAFT = 'draft:77777777-7777-4777-8777-777777777777';
	const DIAGRAM = 'diagram:88888888-8888-4888-8888-888888888888';
	const promoted = () =>
		transitions.replaceTab(
			{ focusedNoteId: 'chat:x', openTabs: ['chat:x', DRAFT], splitNoteId: DRAFT },
			DRAFT,
			DIAGRAM
		);

	it('replaces the draft in place while preserving split and focus state', () => {
		const state = promoted();
		expect({ split: state.splitNoteId, tabs: state.openTabs, focus: state.focusedNoteId }).toEqual({
			split: DIAGRAM,
			tabs: ['chat:x', DIAGRAM],
			focus: 'chat:x'
		});
	});

	it('moves focus with the tab when the replaced one was focused', () => {
		expect(
			transitions.replaceTab({ focusedNoteId: DRAFT, openTabs: [DRAFT] }, DRAFT, DIAGRAM)
				.focusedNoteId
		).toBe(DIAGRAM);
	});

	it('does not duplicate a replacement that is already open', () => {
		expect(
			transitions.replaceTab(
				{ focusedNoteId: 'chat:x', openTabs: ['chat:x', DRAFT, DIAGRAM], splitNoteId: DRAFT },
				DRAFT,
				DIAGRAM
			).openTabs
		).toEqual(['chat:x', DIAGRAM]);
	});

	it('leaves a state that has no such tab untouched', () => {
		const state = { focusedNoteId: 'chat:x', openTabs: ['chat:x'] };
		expect(transitions.replaceTab(state, DRAFT, DIAGRAM)).toBe(state);
	});
});

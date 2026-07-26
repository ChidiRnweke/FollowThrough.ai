import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoteId } from '$lib/models';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(async () => undefined),
	invalidateAll: vi.fn(async () => undefined)
}));

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost/'),
		params: {},
		status: 200,
		error: null,
		data: {}
	},
	navigating: { to: null, from: null, complete: null },
	updated: { check: async () => false }
}));

const { workbench } = await import('./workbench.svelte');

const id = (n: number): NoteId =>
	`00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as NoteId;

afterEach(() => {
	workbench.openTabs = [];
	workbench.focusedNoteId = undefined;
	workbench.splitNoteId = undefined;
});

describe('workbench.splitActive', () => {
	it('is false without a split note', () => {
		workbench.openTabs = [id(1)];
		workbench.focusedNoteId = id(1);
		expect(workbench.splitActive).toBe(false);
	});

	it('is true for a second open tab distinct from the focused note', () => {
		workbench.openTabs = [id(1), id(2)];
		workbench.focusedNoteId = id(1);
		workbench.splitNoteId = id(2);
		expect(workbench.splitActive).toBe(true);
	});

	it('is false when the split note is also the focused note', () => {
		workbench.openTabs = [id(1)];
		workbench.focusedNoteId = id(1);
		workbench.splitNoteId = id(1);
		expect(workbench.splitActive).toBe(false);
	});

	it('is false when the split note is no longer an open tab', () => {
		workbench.openTabs = [id(1)];
		workbench.focusedNoteId = id(1);
		workbench.splitNoteId = id(2);
		expect(workbench.splitActive).toBe(false);
	});
});

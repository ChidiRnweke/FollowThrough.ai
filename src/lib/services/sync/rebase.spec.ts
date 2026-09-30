import { describe, expect, it } from 'vitest';
import { rebaseFields, sameValue, wholeValueRebase } from './rebase';

interface Task {
	readonly title: string;
	readonly status: 'open' | 'done';
	readonly priority?: 'low' | 'high';
	readonly updatedAt: string;
}
const observed: Task = { title: 'Draft', status: 'open', updatedAt: 't1' };
const bookkeeping = new Set(['updatedAt']);

describe('three-way field replay', () => {
	it('keeps both sides when they changed different fields', () => {
		expect(
			rebaseFields(
				observed,
				{ ...observed, status: 'done', updatedAt: 't2' },
				{ ...observed, title: 'Renamed', updatedAt: 't3' },
				bookkeeping
			)
		).toEqual({
			value: { title: 'Renamed', status: 'done', updatedAt: 't2' },
			overlaps: false
		});
	});
	it('reports an overlap when both sides changed one field to different values', () => {
		expect(
			rebaseFields(
				observed,
				{ ...observed, title: 'Mine' },
				{ ...observed, title: 'Theirs' },
				bookkeeping
			).overlaps
		).toBe(true);
	});
	it('does not report an overlap when both sides made the same change', () => {
		expect(
			rebaseFields(
				observed,
				{ ...observed, status: 'done' },
				{ ...observed, status: 'done' },
				bookkeeping
			).overlaps
		).toBe(false);
	});
	it('does not treat server bookkeeping fields as a collision', () => {
		expect(
			rebaseFields(
				observed,
				{ ...observed, status: 'done', updatedAt: 't2' },
				{ ...observed, updatedAt: 't3' },
				bookkeeping
			).overlaps
		).toBe(false);
	});
	it('replays a field the local edit added or removed', () => {
		expect(
			rebaseFields(
				{ ...observed, priority: 'low' },
				{ ...observed, priority: undefined },
				{ ...observed, priority: 'low', title: 'Renamed' },
				bookkeeping
			).value
		).toEqual({ ...observed, title: 'Renamed' });
	});
});

describe('stored value equality', () => {
	it('ignores key order in nested values', () => {
		expect(sameValue({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
	});
	it('treats an absent field and an undefined field as equal', () => {
		expect(sameValue<{ a?: number }>({}, { a: undefined })).toBe(true);
	});
});

describe('whole-value replay', () => {
	it('takes the newer value when the local edit changed nothing', () => {
		expect(wholeValueRebase<string>()('Original', 'Original', 'Theirs')).toEqual({
			value: 'Theirs',
			overlaps: false
		});
	});
	it('reports an overlap when both sides replaced the value', () => {
		expect(wholeValueRebase<string>()('Original', 'Mine', 'Theirs')?.overlaps).toBe(true);
	});
});

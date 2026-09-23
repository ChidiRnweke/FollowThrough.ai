import { expect, it } from 'vitest';
import { noteBuilder, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { prepareNoteSave } from './editing';

it('rejects an unchanged candidate from a stale note revision', () => {
	expect(() =>
		prepareNoteSave(noteBuilder({ currentRevision: 2 }), noteBuilder(), testNow)
	).toThrow('The note has changed since it was loaded');
});

it('keeps saved placement and publication facts when preparing an authored edit', () => {
	const current = noteBuilder({ position: 5, publishedRevision: 1 });
	const result = prepareNoteSave(
		current,
		{ ...current, title: ' Changed ', position: 99, publishedRevision: 0 },
		testNow
	);
	expect(result).toEqual({
		kind: 'write',
		write: {
			expectedRevision: 1,
			note: { ...current, title: 'Changed', currentRevision: 2, updatedAt: testNow }
		}
	});
});

it('refuses even an unchanged save of an archived note', () => {
	const current = noteBuilder({ archivedAt: testNow });
	expect(() => prepareNoteSave(current, current, testNow)).toThrow(
		'Archived notes cannot be edited'
	);
});

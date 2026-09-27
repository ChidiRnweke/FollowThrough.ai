import { expect, it } from 'vitest';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { ancestorFolderIds } from './tree-expansion';

it('returns every ancestor of a deep valid hierarchy', () => {
	const folders = Array.from({ length: 40 }, (_, index) => ({
		id: testNoteId(index + 1),
		...(index ? { parentId: testNoteId(index) } : {})
	}));
	expect(
		ancestorFolderIds(
			{ id: testNoteId(41), parentId: testNoteId(40) },
			new Map(folders.map((folder) => [folder.id, folder]))
		)
	).toEqual(folders.map((folder) => folder.id).reverse());
});
it('does not invent ancestors for a root note', () => {
	expect(ancestorFolderIds({ id: testNoteId() }, new Map())).toEqual([]);
});
it('preserves the known parent identity while its metadata is still missing', () => {
	expect(ancestorFolderIds({ id: testNoteId(), parentId: testNoteId(2) }, new Map())).toEqual([
		testNoteId(2)
	]);
});
it('reports a corrupt parent cycle instead of looping or silently clipping it', () => {
	const first = { id: testNoteId(), parentId: testNoteId(2) };
	const second = { id: testNoteId(2), parentId: first.id };
	expect(() =>
		ancestorFolderIds(
			first,
			new Map([
				[first.id, first],
				[second.id, second]
			])
		)
	).toThrow('Project tree contains a parent cycle');
});

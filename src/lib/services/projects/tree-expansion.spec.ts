import { expect, it } from 'vitest';
import type { NoteId, NoteSummary } from '$lib/models/notes';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { ancestorFolderIds, isWithinSubtree } from './tree-expansion';

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

const subtreeRoot = { id: testNoteId(1) };
const subtreeChild = { id: testNoteId(2), parentId: subtreeRoot.id };
const subtreeGrandchild = { id: testNoteId(3), parentId: subtreeChild.id };
const subtreeEntries = new Map<NoteId, Pick<NoteSummary, 'id' | 'parentId'>>(
	[subtreeRoot, subtreeChild, subtreeGrandchild].map((note) => [note.id, note])
);
it('counts the subtree root as inside its own subtree', () => {
	expect(isWithinSubtree(subtreeRoot, subtreeRoot.id, subtreeEntries)).toBe(true);
});
it('counts a direct child as inside the subtree', () => {
	expect(isWithinSubtree(subtreeChild, subtreeRoot.id, subtreeEntries)).toBe(true);
});
it('counts a deep descendant as inside the subtree', () => {
	expect(isWithinSubtree(subtreeGrandchild, subtreeRoot.id, subtreeEntries)).toBe(true);
});
it('keeps an ancestor outside the subtree of its descendant', () => {
	expect(isWithinSubtree(subtreeRoot, subtreeChild.id, subtreeEntries)).toBe(false);
});

import { expect, it } from 'vitest';
import { noteTrashChange } from './trash';
import { noteBuilder, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

it('restores a note with a deleted parent at the root without changing its publication', () => {
	const note = noteBuilder({
		parentId: testNoteId(2),
		archivedAt: testNow,
		position: 7,
		currentRevision: 4,
		publishedRevision: 3,
		publishedAt: testNow
	});
	const { parentId, archivedAt, ...restored } = note;
	void parentId;
	void archivedAt;
	expect(
		noteTrashChange(note, { kind: 'restore', parent: null, rootSiblingCount: 2 }, testNow)
	).toEqual({
		kind: 'change',
		note: { ...restored, position: 2, updatedAt: testNow }
	});
});

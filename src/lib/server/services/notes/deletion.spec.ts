import { expect, it } from 'vitest';
import { noteBuilder, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { prepareNoteDeletion } from './deletion';

it('deletes trashed children before their folders while preserving hidden skills', () => {
	const parent = noteBuilder({ kind: 'folder', archivedAt: testNow });
	const child = noteBuilder({ id: testNoteId(2), parentId: parent.id, archivedAt: testNow });
	const skill = noteBuilder({
		id: testNoteId(3),
		parentId: parent.id,
		kind: 'skill',
		archivedAt: testNow
	});
	expect(prepareNoteDeletion([parent, skill, child], { kind: 'all' })).toEqual({
		kind: 'delete',
		notes: [
			{ id: child.id, title: child.title },
			{ id: parent.id, title: parent.title }
		]
	});
});

it('refuses an individually selected note that has left the trash', () => {
	expect(prepareNoteDeletion([], { kind: 'one', note: noteBuilder() })).toMatchObject({
		kind: 'invalid',
		message: 'Only notes in the trash can be deleted permanently'
	});
});

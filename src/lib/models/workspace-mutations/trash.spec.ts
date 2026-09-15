import { describe, expect, it } from 'vitest';
import { noteTrashWrite } from './index';
import { noteBuilder, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

describe('local note trash actions', () => {
	it('retains the note body when moving it to trash', () => {
		const note = noteBuilder();
		expect(noteTrashWrite(note, 'archive', [note], testNow)).toEqual({
			command: { kind: 'archiveNote', noteId: note.id },
			local: { type: 'notes', value: { ...note, archivedAt: testNow, updatedAt: testNow } },
			coalesce: null,
			references: []
		});
	});
	it('refuses to hide active children by archiving their folder', () => {
		const folder = noteBuilder({
			kind: 'folder',
			document: { type: 'doc', content: [] },
			plainText: ''
		});
		const child = noteBuilder({ id: testNoteId(2), parentId: folder.id });
		expect(() => noteTrashWrite(folder, 'archive', [folder, child], testNow)).toThrow(
			'A folder with active contents cannot be archived'
		);
	});
	it('allows a folder whose children are already in trash', () => {
		const folder = noteBuilder({
			kind: 'folder',
			document: { type: 'doc', content: [] },
			plainText: ''
		});
		const child = noteBuilder({ id: testNoteId(2), parentId: folder.id, archivedAt: testNow });
		expect(noteTrashWrite(folder, 'archive', [folder, child], testNow).command).toEqual({
			kind: 'archiveNote',
			noteId: folder.id
		});
	});
	it('restores into an active parent and waits for its local creation', () => {
		const folder = noteBuilder({
			kind: 'folder',
			document: { type: 'doc', content: [] },
			plainText: ''
		});
		const child = noteBuilder({
			id: testNoteId(2),
			parentId: folder.id,
			archivedAt: testNow,
			position: 3
		});
		const { archivedAt, ...restored } = child;
		void archivedAt;
		expect(noteTrashWrite(child, 'restore', [folder, child], testNow)).toEqual({
			command: { kind: 'restoreNote', noteId: child.id },
			local: { type: 'notes', value: restored },
			coalesce: null,
			references: [JSON.stringify(['notes', folder.id])]
		});
	});
	it('restores a child of a trashed folder at the project root', () => {
		const folder = noteBuilder({
			kind: 'folder',
			document: { type: 'doc', content: [] },
			plainText: '',
			archivedAt: testNow
		});
		const child = noteBuilder({ id: testNoteId(2), parentId: folder.id, archivedAt: testNow });
		const { archivedAt, parentId, ...restored } = child;
		void archivedAt;
		void parentId;
		expect(noteTrashWrite(child, 'restore', [folder, child], testNow).local).toEqual({
			type: 'notes',
			value: { ...restored, position: 1 }
		});
	});
	it('refuses to restore a note that is already active', () => {
		const note = noteBuilder();
		expect(() => noteTrashWrite(note, 'restore', [note], testNow)).toThrow(
			'The note is not archived'
		);
	});
});

import { expect, it } from 'vitest';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { noteHasUnpublishedChanges } from './index';
const note = noteBuilder({ currentRevision: 2, publishedRevision: 2 });
it('offers publication for an offline edit without inventing a server revision', () => {
	expect(
		noteHasUnpublishedChanges(note, [
			{ kind: 'saveNote', noteId: note.id, document: note.document, plainText: 'Changed locally' }
		])
	).toBe(true);
});
it('treats a queued publication as covering the edits before it', () => {
	expect(
		noteHasUnpublishedChanges(note, [
			{ kind: 'renameNote', noteId: note.id, title: 'Renamed' },
			{ kind: 'publishNote', noteId: note.id }
		])
	).toBe(false);
});
it('retains edits made after a queued publication as unpublished', () => {
	expect(
		noteHasUnpublishedChanges(note, [
			{ kind: 'publishNote', noteId: note.id },
			{ kind: 'renameNote', noteId: note.id, title: 'Later title' }
		])
	).toBe(true);
});
it('does not change publication state for an edit to another note', () => {
	expect(
		noteHasUnpublishedChanges(note, [
			{ kind: 'renameNote', noteId: testNoteId(2), title: 'Another note' }
		])
	).toBe(false);
});

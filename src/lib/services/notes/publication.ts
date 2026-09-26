import type { Note, NotePublicationWrite } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import { ValidationError } from '$lib/errors';

/** Publish the exact revision whose snapshot the controller records in its transaction. */
export function prepareNotePublication(note: Note, timestamp: DateTime): NotePublicationWrite {
	if (note.archivedAt) throw new ValidationError('Archived notes cannot be published');
	return {
		noteId: note.id,
		expectedRevision: note.currentRevision,
		publishedRevision: note.currentRevision,
		publishedAt: timestamp,
		updatedAt: timestamp
	};
}

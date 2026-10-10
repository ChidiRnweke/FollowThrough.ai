import type { NoteId, NoteRevision, NoteRevisionId, NoteRevisionSummary } from '$lib/models/notes';
import type { NoteHistoryReader } from '$lib/controllers/notes/history';
import { listNoteRevisions, getNoteRevision } from '$lib/remote/notes/notes.remote';
export class RemoteNoteHistory implements NoteHistoryReader {
	async list(noteId: NoteId): Promise<readonly NoteRevisionSummary[]> {
		return (await listNoteRevisions(noteId)).revisions;
	}
	async read(noteId: NoteId, revisionId: NoteRevisionId): Promise<NoteRevision> {
		return (await getNoteRevision({ noteId, revisionId })).revision;
	}
}

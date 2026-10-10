import type { NoteId, NoteRevisionId } from '$lib/models/notes';
import type { NoteWorkspaceRevisions } from '$lib/controllers/notes/workspace';
import { RemoteNoteHistory } from './history-reader';
import { restoreNoteRevision } from '$lib/remote/notes/notes.remote';

export class RemoteNoteWorkspaceRevisions
	extends RemoteNoteHistory
	implements NoteWorkspaceRevisions
{
	async restore(noteId: NoteId, revisionId: NoteRevisionId): Promise<void> {
		await restoreNoteRevision({ noteId, revisionId });
	}
}

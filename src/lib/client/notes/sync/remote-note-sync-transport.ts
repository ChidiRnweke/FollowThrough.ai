import type { NoteId, SyncNoteInput, SyncNoteOutput, VersionedNote } from '$lib/models/notes';
import { getNoteView, syncNote } from '$lib/remote/notes/notes.remote';
import type { NoteSyncTransport } from './contracts';

export class RemoteNoteSyncTransport implements NoteSyncTransport {
	async getVersion(noteId: NoteId): Promise<VersionedNote> {
		const view = await getNoteView(noteId);
		return { note: view.note, etag: view.etag } as VersionedNote;
	}

	sync(input: SyncNoteInput): Promise<SyncNoteOutput> {
		return syncNote(input) as Promise<SyncNoteOutput>;
	}
}

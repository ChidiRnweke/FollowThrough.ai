import type {
	NoteId,
	NoteSyncRecord,
	SyncNoteInput,
	SyncNoteOutput,
	VersionedNote
} from '$lib/models/notes';
import type { UserId } from '$lib/models/identity';

export interface NoteSyncRepository {
	get(userId: UserId, noteId: NoteId): Promise<NoteSyncRecord | undefined>;
	put(record: NoteSyncRecord): Promise<void>;
	delete(userId: UserId, noteId: NoteId): Promise<void>;
	close(): void;
}

export interface NoteSyncTransport {
	getVersion(noteId: NoteId): Promise<VersionedNote>;
	sync(input: SyncNoteInput): Promise<SyncNoteOutput>;
}

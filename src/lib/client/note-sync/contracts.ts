import type { NoteId, NoteSyncRecord, SyncNoteInput, SyncNoteOutput, UserId } from '$lib/models';

export interface NoteSyncRepository {
	get(userId: UserId, noteId: NoteId): Promise<NoteSyncRecord | undefined>;
	put(record: NoteSyncRecord): Promise<void>;
	delete(userId: UserId, noteId: NoteId): Promise<void>;
	close(): void;
}

export interface NoteSyncTransport {
	sync(input: SyncNoteInput): Promise<SyncNoteOutput>;
}

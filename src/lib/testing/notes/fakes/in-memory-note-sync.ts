import type {
	NoteId,
	NoteSyncRecord,
	SyncNoteInput,
	SyncNoteOutput,
	VersionedNote
} from '$lib/models/notes';
import type { UserId } from '$lib/models/identity';
import type { NoteSyncRepository, NoteSyncTransport } from '$lib/client/notes/sync/contracts';

const key = (userId: UserId, noteId: NoteId): string => `${userId}:${noteId}`;

export class InMemoryNoteSyncRepository implements NoteSyncRepository {
	readonly records = new Map<string, NoteSyncRecord>();

	async get(userId: UserId, noteId: NoteId): Promise<NoteSyncRecord | undefined> {
		return structuredClone(this.records.get(key(userId, noteId)));
	}

	async put(record: NoteSyncRecord): Promise<void> {
		this.records.set(key(record.userId, record.noteId), structuredClone(record));
	}

	async delete(userId: UserId, noteId: NoteId): Promise<void> {
		this.records.delete(key(userId, noteId));
	}

	close(): void {}
}

export class InMemoryNoteSyncTransport implements NoteSyncTransport {
	version?: VersionedNote;
	output?: SyncNoteOutput;
	failure?: Error;
	onSync?: (input: SyncNoteInput) => Promise<SyncNoteOutput>;

	async getVersion(noteId: NoteId): Promise<VersionedNote> {
		void noteId;
		if (this.failure) throw this.failure;
		if (!this.version) throw new Error('No note version configured');
		return this.version;
	}

	async sync(input: SyncNoteInput): Promise<SyncNoteOutput> {
		if (this.failure) throw this.failure;
		if (this.onSync) return this.onSync(input);
		if (!this.output) throw new Error('No note sync output configured');
		return this.output;
	}
}

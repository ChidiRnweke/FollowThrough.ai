import type { SyncNoteInput, SyncNoteOutput } from '$lib/models';
import { syncNote } from '$lib/remote/notes.remote';
import type { NoteSyncTransport } from './contracts';

export class RemoteNoteSyncTransport implements NoteSyncTransport {
	sync(input: SyncNoteInput): Promise<SyncNoteOutput> {
		return syncNote(input) as Promise<SyncNoteOutput>;
	}
}

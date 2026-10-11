import { NoteHistory, type NoteHistoryController } from '$lib/controllers/notes/history';
import { NoteHistoryStore } from '$lib/stores/notes/history.svelte';
import { RemoteNoteHistory } from '$lib/client/notes/history-reader';
import { NotePresentationService } from '$lib/services/notes/presentation';
import type { NoteId } from '$lib/models/notes';
export const createNoteHistory = (noteId: NoteId): NoteHistoryController =>
	new NoteHistory(
		noteId,
		new NoteHistoryStore(),
		new RemoteNoteHistory(),
		new NotePresentationService()
	);

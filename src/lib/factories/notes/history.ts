import { NoteHistory, type NoteHistoryController } from '$lib/controllers/notes/history';
import { NoteHistoryStore } from '$lib/stores/notes/history.svelte';
import { RemoteNoteHistory } from '$lib/client/notes/history-reader';
import { NotePresentationService } from '$lib/services/notes/presentation';
import type { NoteId } from '$lib/models/notes';
import { workspaceSessionState } from '$lib/factories/workspace/session';
export const createNoteHistory = (noteId: NoteId): NoteHistoryController =>
	new NoteHistory(
		noteId,
		new NoteHistoryStore(),
		workspaceSessionState,
		new RemoteNoteHistory(),
		new NotePresentationService()
	);

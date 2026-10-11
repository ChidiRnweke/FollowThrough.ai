import { NoteActionEventReader } from '$lib/client/notes/action-event-reader';
import {
	NoteActionRuns,
	NoteActionTracking,
	type NoteActionRunsController,
	type NoteActionRunsFactory,
	type NoteActionTrackingController
} from '$lib/controllers/notes/action-runs';
import { NoteActionRunStore } from '$lib/stores/notes/note-action-runs.svelte';
import { BrowserNoteActionRunTransport } from '$lib/client/notes/action-run-transport';
import { SessionRunStorage } from '$lib/client/notes/action-run-storage';
import type { NoteId } from '$lib/models/notes';

class BrowserNoteActionRunsFactory implements NoteActionRunsFactory {
	create(noteId: NoteId, accountId: string): NoteActionRunsController {
		return new NoteActionRuns(
			noteId,
			new NoteActionRunStore(),
			new BrowserNoteActionRunTransport(new NoteActionEventReader()),
			new SessionRunStorage(sessionStorage, accountId)
		);
	}
}
export const noteActionTracking: NoteActionTrackingController = new NoteActionTracking(
	new BrowserNoteActionRunsFactory()
);

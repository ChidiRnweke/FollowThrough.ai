import { NoteActionEventReader } from '$lib/client/notes/action-event-reader';
import {
	NoteActionRuns,
	NoteActionTracking,
	type NoteActionRunsController,
	type NoteActionRunsFactory,
	type NoteActionTrackingController
} from '$lib/controllers/notes/action-runs';
import type { NoteActionSession } from '$lib/models/browser-workspace';
import { NoteActionRunStore } from '$lib/stores/notes/note-action-runs.svelte';
import { BrowserNoteActionRunTransport } from '$lib/client/notes/action-run-transport';
import { SessionRunStorage } from '$lib/client/notes/action-run-storage';
import { workspaceSession } from '$lib/factories/workspace/session';
import type { NoteId } from '$lib/models/notes';

class BrowserNoteActionRunsFactory implements NoteActionRunsFactory {
	create(noteId: NoteId, session: NoteActionSession): NoteActionRunsController {
		return new NoteActionRuns(
			noteId,
			session,
			workspaceSession,
			new NoteActionRunStore(),
			new BrowserNoteActionRunTransport(new NoteActionEventReader()),
			new SessionRunStorage(sessionStorage, session.bootstrap.accountId)
		);
	}
}
export const noteActionTracking: NoteActionTrackingController = new NoteActionTracking(
	workspaceSession,
	new BrowserNoteActionRunsFactory()
);

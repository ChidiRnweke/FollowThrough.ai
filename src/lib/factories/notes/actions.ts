import { NoteActions, type NoteActionsController } from '$lib/controllers/notes/actions';
import { NoteActionStore } from '$lib/stores/notes/note-actions.svelte';
import { RemoteNoteReviews } from '$lib/client/notes/review-transport';
import { workspaceSession } from '$lib/factories/workspace/session';
import { noteSubmissions } from './submissions';
export const noteActions: NoteActionsController = new NoteActions(
	new NoteActionStore(),
	workspaceSession,
	noteSubmissions,
	new RemoteNoteReviews()
);

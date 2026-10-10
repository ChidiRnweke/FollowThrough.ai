import { NoteActions, type NoteActionsController } from '$lib/controllers/notes/actions';
import { NoteActionStore } from '$lib/stores/notes/note-actions.svelte';
import { RemoteNoteReviews } from '$lib/client/notes/review-transport';
import { workspaceSessionState } from '$lib/factories/workspace/session';
import { NoteActionIdentityService } from '$lib/services/notes/action-identities';
import { BrowserSelectionSubmissionStorage } from '$lib/client/notes/selection-submissions';
import { BrowserDiagramSubmissionStorage } from '$lib/client/notes/diagram-submissions';
import {
	RemoteNoteSubmissions,
	BrowserNoteSubmissionIdentity
} from '$lib/client/notes/submission-transport';
export const noteActions: NoteActionsController = new NoteActions(
	new NoteActionStore(),
	workspaceSessionState,
	new BrowserSelectionSubmissionStorage(() => sessionStorage),
	new BrowserDiagramSubmissionStorage(() => sessionStorage),
	new NoteActionIdentityService(),
	new RemoteNoteSubmissions(),
	new BrowserNoteSubmissionIdentity(),
	new RemoteNoteReviews()
);

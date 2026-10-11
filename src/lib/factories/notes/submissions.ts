import { NoteSubmissions, type NoteSubmissionController } from '$lib/controllers/notes/submissions';
import { NoteActionIdentityService } from '$lib/services/notes/action-identities';
import { BrowserSelectionSubmissionStorage } from '$lib/client/notes/selection-submissions';
import { BrowserDiagramSubmissionStorage } from '$lib/client/notes/diagram-submissions';
import {
	RemoteNoteSubmissions,
	BrowserNoteSubmissionIdentity
} from '$lib/client/notes/submission-transport';
export const noteSubmissions: NoteSubmissionController = new NoteSubmissions(
	new BrowserSelectionSubmissionStorage(() => sessionStorage),
	new BrowserDiagramSubmissionStorage(() => sessionStorage),
	new NoteActionIdentityService(),
	new RemoteNoteSubmissions(),
	new BrowserNoteSubmissionIdentity()
);

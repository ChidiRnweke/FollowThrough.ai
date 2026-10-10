import { TiptapDocumentCopy } from '$lib/client/notes/editor-document';
import { BrowserNoteWorkspaceFeedback } from '$lib/client/notes/workspace-feedback';
import { RemoteNoteWorkspaceRevisions } from '$lib/client/notes/workspace-revisions';
import { browserSyncScheduler } from '$lib/client/sync/scheduler';
import { BrowserWorkspaceEditingEnvironment } from '$lib/client/workspace/editing-environment.svelte';
import {
	NoteWorkspace,
	type NoteWorkspaceController,
	type NoteWorkspaceDependencies
} from '$lib/controllers/notes/workspace';
import type { WorkspaceDraftController } from '$lib/controllers/workspace/resources';
import { workspaceAccounts, workspaceDraftStates } from '$lib/factories/workspace/capabilities';
import {
	workspaceSessionEnvironment,
	workspaceSessionState
} from '$lib/factories/workspace/session';
import type { NoteEditorIdentity } from '$lib/models/browser-workspace';
import type { NoteId } from '$lib/models/notes';
import { NoteDocumentPresentationService } from '$lib/services/notes/document-presentation';
import { NoteEditingService } from '$lib/services/notes/editing';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { noteHasUnpublishedChanges } from '$lib/services/workspace/commands';
import { WorkspaceDraftService } from '$lib/services/workspace/draft';
import { NoteWorkspaceStore } from '$lib/stores/notes/workspace.svelte';
import { EditorSessionStore } from '$lib/stores/workspace/editor-session.svelte';
import { noteEditorCapabilities } from './editor-capabilities';

export function createNoteWorkspace(
	noteId: NoteId,
	draft: WorkspaceDraftController<'notes'>,
	editorIdentity: () => NoteEditorIdentity | undefined,
	conflictChanged: NoteWorkspaceDependencies['conflictChanged']
): NoteWorkspaceController {
	const current = workspaceSessionState.required;
	return new NoteWorkspace({
		state: new NoteWorkspaceStore(),
		noteId,
		draftState: workspaceDraftStates.get(draft),
		account: workspaceAccounts.get(current.resources),
		binding: {
			state: workspaceSessionState,
			environment: workspaceSessionEnvironment,
			generation: workspaceSessionState.generation,
			dispose: workspaceAccounts.get(current.resources).dispose
		},
		sessionState: new EditorSessionStore(),
		environment: new BrowserWorkspaceEditingEnvironment(),
		draftRules: new WorkspaceDraftService(),
		noteEditing: new NoteEditingService(),
		sections: new NoteSectionNumberingService(),
		presentation: new NoteDocumentPresentationService(),
		documents: new TiptapDocumentCopy(),
		editorIdentity,
		editors: noteEditorCapabilities,
		revisions: new RemoteNoteWorkspaceRevisions(),
		feedback: new BrowserNoteWorkspaceFeedback(),
		scheduler: browserSyncScheduler,
		rules: { noteHasUnpublishedChanges },
		conflictChanged
	});
}

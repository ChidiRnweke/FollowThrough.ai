import {
	NoteWorkspace,
	type NoteWorkspaceController,
	type NoteWorkspaceDependencies
} from '$lib/controllers/notes/workspace';
import type { WorkspaceDraftController } from '$lib/controllers/workspace/resources';
import type { NoteId } from '$lib/models/notes';
import { NoteWorkspaceStore } from '$lib/stores/notes/workspace.svelte';
import { RemoteNoteWorkspaceRevisions } from '$lib/client/notes/workspace-revisions';
import { BrowserNoteWorkspaceFeedback } from '$lib/client/notes/workspace-feedback';
import { browserSyncScheduler } from '$lib/client/sync/scheduler';
import { noteHasUnpublishedChanges } from '$lib/services/workspace/commands';
import { createEditorSession } from '$lib/factories/workspace/editor-session';
import { workspaceSession } from '$lib/factories/workspace/session';
import { createNoteDraftEditing } from './draft-editing';

export function createNoteWorkspace(
	noteId: NoteId,
	draft: WorkspaceDraftController<'notes'>,
	editor: NoteWorkspaceDependencies['editor'],
	conflictChanged: NoteWorkspaceDependencies['conflictChanged']
): NoteWorkspaceController {
	return new NoteWorkspace({
		state: new NoteWorkspaceStore(),
		draft,
		session: createEditorSession(() => draft.active),
		editing: createNoteDraftEditing(noteId, draft),
		editor,
		workspace: workspaceSession,
		revisions: new RemoteNoteWorkspaceRevisions(),
		feedback: new BrowserNoteWorkspaceFeedback(),
		scheduler: browserSyncScheduler,
		rules: { noteHasUnpublishedChanges },
		conflictChanged
	});
}

import type { NoteWorkspaceEditor } from '$lib/controllers/notes/workspace';
import {
	WorkspaceCapabilityStore,
	type WorkspaceCapabilityRegistry
} from '$lib/stores/workspace/capabilities';
export const noteEditorCapabilities: WorkspaceCapabilityRegistry<NoteWorkspaceEditor> =
	new WorkspaceCapabilityStore<NoteWorkspaceEditor>();

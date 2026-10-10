import type { NoteWorkspaceAccount } from '$lib/controllers/notes/workspace';
import {
	WorkspaceCapabilityStore,
	type WorkspaceCapabilityRegistry
} from '$lib/stores/workspace/capabilities';
import type { WorkspaceDraftStateAccess } from '$lib/stores/workspace/draft.svelte';
export const workspaceAccounts: WorkspaceCapabilityRegistry<
	NoteWorkspaceAccount & { readonly dispose: () => void }
> = new WorkspaceCapabilityStore<NoteWorkspaceAccount & { readonly dispose: () => void }>();
export const workspaceDraftStates: WorkspaceCapabilityRegistry<WorkspaceDraftStateAccess> =
	new WorkspaceCapabilityStore<WorkspaceDraftStateAccess>();

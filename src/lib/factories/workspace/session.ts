import { BrowserWorkspaceSessionEnvironment } from '$lib/client/sync/session-environment';
import { IndexedDbStorageRecovery } from '$lib/client/sync/storage-recovery';
import {
	WorkspaceSessions,
	type WorkspaceSessionController
} from '$lib/controllers/workspace/session';
import { createWorkspaceResources } from '$lib/factories/workspace/resources';
import {
	AgentModelChoiceService,
	AgentModelSelectionService
} from '$lib/services/agent/model-selection';
import {
	WorkspaceSessionStore,
	type WorkspaceSessionStateAccess
} from '$lib/stores/workspace/session.svelte';
/** One browser application graph. Construction does not start the account. */
export const workspaceSessionState: WorkspaceSessionStateAccess = new WorkspaceSessionStore();
export const workspaceSessionEnvironment = new BrowserWorkspaceSessionEnvironment();
export const workspaceSession: WorkspaceSessionController = new WorkspaceSessions(
	workspaceSessionState,
	workspaceSessionEnvironment,
	{ create: createWorkspaceResources },
	new IndexedDbStorageRecovery(),
	{ modelSelection: new AgentModelSelectionService(), modelChoices: new AgentModelChoiceService() }
);

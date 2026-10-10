import {
	AgentModelSelectionService,
	AgentModelChoiceService
} from '$lib/services/agent/model-selection';
import {
	WorkspaceSessions,
	type WorkspaceSessionController
} from '$lib/controllers/workspace/session';
import { WorkspaceSessionStore } from '$lib/stores/workspace/session.svelte';
import { BrowserWorkspaceSessionEnvironment } from '$lib/client/sync/session-environment';
import { IndexedDbStorageRecovery } from '$lib/client/sync/storage-recovery';
import { createWorkspaceResources } from '$lib/factories/workspace/resources';
/** One browser application graph. Construction does not start the account. */
export const workspaceSession: WorkspaceSessionController = new WorkspaceSessions(
	new WorkspaceSessionStore(),
	new BrowserWorkspaceSessionEnvironment(),
	{ create: createWorkspaceResources },
	new IndexedDbStorageRecovery(),
	{ modelSelection: new AgentModelSelectionService(), modelChoices: new AgentModelChoiceService() }
);

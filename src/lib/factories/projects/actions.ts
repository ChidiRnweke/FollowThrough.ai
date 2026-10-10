import { ProjectActions, type ProjectActionsController } from '$lib/controllers/projects/actions';
import { ProjectActionStore } from '$lib/stores/projects/project-actions.svelte';
import { RemoteProjectActions, BrowserProjectActions } from '$lib/client/projects/actions';
import { workspaceSession } from '$lib/factories/workspace/session';
export const projectActions: ProjectActionsController = new ProjectActions(
	new ProjectActionStore(),
	workspaceSession,
	new RemoteProjectActions(),
	new BrowserProjectActions()
);

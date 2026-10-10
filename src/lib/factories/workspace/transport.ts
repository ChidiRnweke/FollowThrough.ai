import {
	WorkspaceReads,
	WorkspaceWrites,
	type WorkspaceReadController,
	type WorkspaceWriteController
} from '$lib/controllers/workspace/transport';
import { workspaceReadAdapter, workspaceWriteAdapter } from '$lib/client/sync/workspace-transport';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
export const workspaceReadTransport = (accountId: string): WorkspaceReadController =>
	new WorkspaceReads(workspaceReadAdapter(accountId), new WorkspaceCommandRulesService());
export const workspaceWriteTransport = (accountId: string): WorkspaceWriteController =>
	new WorkspaceWrites(
		workspaceWriteAdapter(accountId),
		workspaceReadTransport(accountId),
		new WorkspaceCommandRulesService()
	);

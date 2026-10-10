import { AccountPresentationService } from '$lib/services/workspace/initials';
import { SidebarSizingService } from '$lib/services/workspace/sidebar-width';
import { SyncPresentationService } from '$lib/services/sync/indicator';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { SyncResourceRulesService } from '$lib/services/sync/state';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import {
	WorkspacePresentation,
	type WorkspacePresentationController
} from '$lib/controllers/workspace/presentation';
export const workspacePresentation: WorkspacePresentationController = new WorkspacePresentation(
	new AccountPresentationService(),
	new SidebarSizingService(),
	new SyncPresentationService(),
	new ProvenancePresentationService(),
	new SyncResourceRulesService(),
	new WorkspaceCommandRulesService()
);

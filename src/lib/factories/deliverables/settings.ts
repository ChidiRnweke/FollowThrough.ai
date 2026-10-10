import {
	workspaceSessionState,
	workspaceSessionEnvironment
} from '$lib/factories/workspace/session';
import { workspaceAccounts } from '$lib/factories/workspace/capabilities';
import {
	CacheCommitService,
	WorkspaceProjectionService,
	OutboxEditingService
} from '$lib/services/sync/state';
import { BrowserWorkspaceEditingEnvironment } from '$lib/client/workspace/editing-environment.svelte';
import {
	ProjectExportSettings,
	type ProjectExportSettingsController
} from '$lib/controllers/deliverables/settings';
import { ExportSettingsStore } from '$lib/stores/deliverables/settings.svelte';
import { ExportSettingsRuleService } from '$lib/services/deliverables/settings';
import { WorkspaceDraftService } from '$lib/services/workspace/draft';
import { WriteAncestryService } from '$lib/services/sync/ancestry';
import { WorkspaceFieldReplayService } from '$lib/services/sync/rebase';
export const createProjectExportSettings = (): ProjectExportSettingsController =>
	new ProjectExportSettings(new ExportSettingsStore(), {
		session: workspaceSessionState,
		environment: workspaceSessionEnvironment,
		accounts: workspaceAccounts,
		snapshots: new BrowserWorkspaceEditingEnvironment(),
		cacheMerge: new CacheCommitService(),
		projection: new WorkspaceProjectionService(),
		rules: new ExportSettingsRuleService(),
		drafts: new WorkspaceDraftService(),
		ancestry: new WriteAncestryService(),
		fields: new WorkspaceFieldReplayService(),
		editing: new OutboxEditingService()
	});

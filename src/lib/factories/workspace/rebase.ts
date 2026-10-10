import { WorkspaceRebase, type WorkspaceRebaseController } from '$lib/controllers/workspace/rebase';
import { FieldReplayService } from '$lib/services/sync/rebase';
import { WidgetPatchService } from '$lib/services/widgets/patches';
import { createWidgetEditingController } from '$lib/factories/widgets/editing';
export const workspaceRebase: WorkspaceRebaseController = new WorkspaceRebase(
	new FieldReplayService(),
	new WidgetPatchService(),
	createWidgetEditingController()
);

import { CatalogWidgetCandidateReader } from '$lib/adapters/widgets/candidate-reader';
import { WorkspaceRebase } from '$lib/controllers/workspace/rebase';
import type { WriteRebase } from '$lib/models/outbox';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceFieldReplayService } from '$lib/services/sync/rebase';
import { WidgetEditingService } from '$lib/services/widgets/edits';
import { WidgetPatchService } from '$lib/services/widgets/patches';
export const rebaseWorkspaceRecord: WriteRebase<WorkspaceRecord> = new WorkspaceRebase(
	new WorkspaceFieldReplayService(),
	new WidgetPatchService(),
	new CatalogWidgetCandidateReader(),
	new WidgetEditingService()
).rebase;

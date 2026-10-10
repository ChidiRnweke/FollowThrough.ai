import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { WorkspaceViews, type WorkspaceViewsController } from '$lib/controllers/workspace/views';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceProjectionStore } from '$lib/stores/workspace/projection.svelte';
export const createWorkspaceViews = (
	records: ReadonlyMap<string, WorkspaceRecord>
): WorkspaceViewsController =>
	new WorkspaceViews(new WorkspaceProjectionStore(records), new MemoryPresentationService());

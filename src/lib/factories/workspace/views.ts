import { AttachmentPresentationService } from '$lib/services/attachments/presentation';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { WorkspaceViews, type WorkspaceViewsController } from '$lib/controllers/workspace/views';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceProjectionStore } from '$lib/stores/workspace/projection.svelte';
export const createWorkspaceViews = (
	records: ReadonlyMap<string, WorkspaceRecord>
): WorkspaceViewsController =>
	new WorkspaceViews(
		new TodoPresentationService(),
		new WorkspaceProjectionStore(records),
		new SuggestionPresentationService(),
		new MemoryPresentationService(),
		new ProjectTreePresentationService(),
		new NotePresentationService(),
		new NoteSectionNumberingService(),
		new AttachmentPresentationService()
	);

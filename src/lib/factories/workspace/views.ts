import { SkillPortabilityService } from '$lib/services/skills/manifest';
import { BacklinkPresentationService } from '$lib/services/relationships/presentation';
import { ReferencePresentationService } from '$lib/services/references/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { TodayPresentationService } from '$lib/services/workspace/today';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { WorkspaceViews, type WorkspaceViewsController } from '$lib/controllers/workspace/views';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceProjectionStore } from '$lib/stores/workspace/projection.svelte';
import { WorkspaceSessionStore } from '$lib/stores/workspace/session.svelte';
/** Views over a projection; the workspace's own views share its projection and session. */
export const createWorkspaceViews = (
	records: ReadonlyMap<string, WorkspaceRecord> | WorkspaceProjectionStore,
	session: WorkspaceSessionStore = new WorkspaceSessionStore()
): WorkspaceViewsController =>
	new WorkspaceViews(
		new BacklinkPresentationService(),
		new ReferencePresentationService(),
		new WorkspaceCommandRulesService(),
		new ProvenancePresentationService(),
		new TodayPresentationService(),
		new TodoPresentationService(),
		records instanceof WorkspaceProjectionStore ? records : new WorkspaceProjectionStore(records),
		new SuggestionPresentationService(),
		new MemoryPresentationService(),
		new ProjectTreePresentationService(),
		new NotePresentationService(),
		new NoteSectionNumberingService(),
		session,
		new SkillPortabilityService()
	);

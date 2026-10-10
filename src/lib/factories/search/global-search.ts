import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import type { SyncScheduler } from '$lib/models/sync';
import { GlobalSearch, type GlobalSearchController } from '$lib/controllers/search/global-search';
import { GlobalSearchStore } from '$lib/stores/search/global-search.svelte';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { NoteReplacements } from '$lib/controllers/notes/replace';
import { browserSyncScheduler } from '$lib/client/sync/scheduler';
import { SvelteSearchDraftCopy } from '$lib/client/search/draft-copy.svelte';
import { workspaceSession } from '$lib/factories/workspace/session';
import type { WorkspaceResourcesController } from '$lib/controllers/workspace/resources';
export const createGlobalSearch = (
	workspace: () => WorkspaceResourcesController | undefined,
	scheduler: SyncScheduler = browserSyncScheduler
): GlobalSearchController => {
	const rules = new NoteTextSearchService();
	return new GlobalSearch(
		new GlobalSearchStore(),
		workspace,
		rules,
		new NoteReplacements(new WorkspaceCommandRulesService(), rules),
		scheduler,
		new SvelteSearchDraftCopy()
	);
};
export const globalSearch: GlobalSearchController = createGlobalSearch(
	() => workspaceSession.current?.resources
);

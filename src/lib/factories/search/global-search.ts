import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import type { SyncScheduler } from '$lib/models/sync';
import { GlobalSearch, type GlobalSearchController } from '$lib/controllers/search/global-search';
import { GlobalSearchStore } from '$lib/stores/search/global-search.svelte';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { browserSyncScheduler } from '$lib/client/sync/scheduler';
export const createGlobalSearch = (
	scheduler: SyncScheduler = browserSyncScheduler
): GlobalSearchController =>
	new GlobalSearch(
		new GlobalSearchStore(),
		new NoteTextSearchService(),
		new WorkspaceCommandRulesService(),
		scheduler
	);
export const globalSearch: GlobalSearchController = createGlobalSearch();

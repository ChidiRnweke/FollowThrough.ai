import type { PageServerLoad } from './$types';
import type { NoteId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import { parseWorkbenchUrl } from '$lib/stores/workbench-url';

// The workbench shell in `(app)/+layout.svelte` always renders the tab strip
// chrome; this page renders the actual editor surface for `/notes/<id>`
// paths via `<WorkspacePanes>`.  The page's own load does two things:
//
//   1. `await parent()` so the layout's already-loaded shell is reused
//      (no duplicate fetch).
//   2. Fetches the focused note's full `NoteView` so the focused pane
//      SSR-hydrates on first paint instead of round-tripping through
//      `getNoteView` on the client.  Background tabs hydrate lazily.
export const load: PageServerLoad = async ({ params, url, parent }) => {
	const { shell } = await parent();
	const workbenchState = parseWorkbenchUrl(url.pathname, url.searchParams);
	if (!workbenchState) {
		// SvelteKit routing guarantees the URL is `/notes/<id>` when this load
		// fires, so `parseWorkbenchUrl` only returns undefined on a malformed
		// id — fall back to the path param so the pane still has something to
		// hydrate from.
		const fallbackId = params.id as NoteId;
		const view = await AppFactory.controllerFactory()
			.notes()
			.get(AppFactory.actor(), { noteId: fallbackId });
		return { shell, focusedNoteView: view };
	}
	const view = await AppFactory.controllerFactory()
		.notes()
		.get(AppFactory.actor(), { noteId: workbenchState.focusedNoteId as NoteId });
	return { shell, focusedNoteView: view };
};

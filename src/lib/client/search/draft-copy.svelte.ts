import type { Note } from '$lib/models/notes';
import type { SearchDraftCopy } from '$lib/controllers/search/global-search';
export class SvelteSearchDraftCopy implements SearchDraftCopy {
	copy(note: Note): Note {
		return $state.snapshot(note) as Note;
	}
}

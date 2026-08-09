import type {
	NoteId,
	NoteSearchHit,
	ReplaceNoteTextOutput
} from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { replaceInNotes, searchNotes } from '$lib/remote/notes/notes.remote';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * State for the global note search surface, shared by the right panel and the workbench
 * pane so moving the search between them loses nothing — the same trick the chat panel
 * uses with its session key.
 *
 * The server is authoritative for matching: the store ships the query and renders what
 * comes back. Responses carry a sequence number so a slow earlier search never overwrites
 * a newer one.
 */
export class GlobalSearchStore {
	query = $state('');
	replacement = $state('');
	regex = $state(false);
	caseSensitive = $state(false);
	projectId = $state<ProjectId | undefined>(undefined);
	replaceOpen = $state(false);
	hits = $state<readonly NoteSearchHit[]>([]);
	searching = $state(false);
	/** Set when the pattern cannot run — an empty query or an invalid regex. */
	searchError = $state<string | undefined>(undefined);
	lastReplace = $state<ReplaceNoteTextOutput | undefined>(undefined);
	/** Notes collapsed in the result list, by id. */
	collapsedNoteIds = $state<ReadonlySet<NoteId>>(new Set());

	private requestSeq = 0;
	private debounceTimer: ReturnType<typeof setTimeout> | undefined;

	totalMatches = $derived(
		this.hits.reduce((count, hit) => count + hit.titleMatches.length + hit.matches.length, 0)
	);

	/** Input changed: clear the replace summary and search again once the typing settles. */
	scheduleSearch(): void {
		this.lastReplace = undefined;
		clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => void this.search(), SEARCH_DEBOUNCE_MS);
	}

	async search(): Promise<void> {
		clearTimeout(this.debounceTimer);
		const seq = ++this.requestSeq;
		if (this.query === '') {
			this.hits = [];
			this.searchError = undefined;
			this.searching = false;
			return;
		}
		this.searching = true;
		try {
			const result = await searchNotes({
				query: this.query,
				regex: this.regex,
				caseSensitive: this.caseSensitive,
				...(this.projectId ? { projectId: this.projectId } : {})
			});
			if (seq !== this.requestSeq) return;
			this.hits = result.hits;
			this.searchError = undefined;
		} catch (error) {
			if (seq !== this.requestSeq) return;
			this.hits = [];
			this.searchError = error instanceof Error ? error.message : 'Search failed';
		} finally {
			if (seq === this.requestSeq) this.searching = false;
		}
	}

	async replaceAll(): Promise<void> {
		await this.replace({});
	}

	async replaceInNote(noteId: NoteId): Promise<void> {
		await this.replace({ noteIds: [noteId] });
	}

	toggleCollapsed(noteId: NoteId): void {
		const next = new Set(this.collapsedNoteIds);
		if (next.has(noteId)) next.delete(noteId);
		else next.add(noteId);
		this.collapsedNoteIds = next;
	}

	private async replace(scope: { noteIds?: NoteId[] }): Promise<void> {
		if (this.query === '') return;
		try {
			this.lastReplace = await replaceInNotes({
				query: this.query,
				regex: this.regex,
				caseSensitive: this.caseSensitive,
				replacement: this.replacement,
				...(this.projectId ? { projectId: this.projectId } : {}),
				...scope
			});
			this.searchError = undefined;
		} catch (error) {
			this.searchError = error instanceof Error ? error.message : 'Replace failed';
			return;
		}
		await this.search();
	}
}

export const globalSearch = new GlobalSearchStore();

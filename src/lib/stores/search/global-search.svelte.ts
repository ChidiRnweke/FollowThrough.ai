import { SvelteSet } from 'svelte/reactivity';
import {
	buildNoteSearchPattern,
	searchNoteTargets,
	replaceInNoteDocument,
	type NoteId,
	type NoteSearchHit,
	type SearchNoteTextInput,
	type ReplaceNoteTextOutput
} from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { workspaceSession } from '$lib/stores/workspace/session.svelte';
import { noteWrite } from '$lib/models/workspace-mutations';

const SEARCH_DEBOUNCE_MS = 300;

/** Search UI state shared by the panel and canvas. Results project the shared device records. */
export class GlobalSearchStore {
	query = $state('');
	replacement = $state('');
	regex = $state(false);
	caseSensitive = $state(false);
	projectId = $state<ProjectId | undefined>(undefined);
	private submitted = $state<SearchNoteTextInput | null>(null);
	hits = $derived.by<readonly NoteSearchHit[]>(() => {
		const input = this.submitted;
		const resources = workspaceSession.current?.resources;
		if (!input || !resources) return [];
		return searchNoteTargets(
			resources.views.notes.filter(
				(note) => !input.projectId || note.projectId === input.projectId
			),
			input.query,
			input
		);
	});
	partial = $derived(workspaceSession.current?.resources.availability !== 'complete');
	searching = $state(false);
	/** Set when the pattern cannot run — an empty query or an invalid regex. */
	searchError = $state<string | undefined>(undefined);
	lastReplace = $state<ReplaceNoteTextOutput | undefined>(undefined);
	/** Notes collapsed in the result list, by id. */
	collapsedNoteIds = new SvelteSet<NoteId>();

	private debounceTimer: ReturnType<typeof setTimeout> | undefined;

	totalMatches = $derived(
		this.hits.reduce((count, hit) => count + hit.titleMatches.length + hit.matches.length, 0)
	);

	/** Input changed: clear the replace summary and search again once the typing settles. */
	scheduleSearch(): void {
		this.lastReplace = undefined;
		this.searching = true;
		clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => void this.search(), SEARCH_DEBOUNCE_MS);
	}

	search(): Promise<void> {
		clearTimeout(this.debounceTimer);
		const input = {
			query: this.query,
			regex: this.regex,
			caseSensitive: this.caseSensitive,
			projectId: this.projectId
		};
		this.searching = false;
		this.submitted = input.query && buildNoteSearchPattern(input.query, input) ? input : null;
		this.searchError =
			input.query && !this.submitted
				? 'The search pattern is not a valid regular expression'
				: undefined;
		return Promise.resolve();
	}

	async replaceAll(): Promise<void> {
		const result = await this.replace({});
		if (result) throw new Error(result.message);
	}

	async replaceInNote(noteId: NoteId): Promise<void> {
		const result = await this.replace({ noteIds: [noteId] });
		if (result) throw new Error(result.message);
	}

	toggleCollapsed(noteId: NoteId): void {
		if (this.collapsedNoteIds.has(noteId)) this.collapsedNoteIds.delete(noteId);
		else this.collapsedNoteIds.add(noteId);
	}

	private async replace(scope: {
		noteIds?: NoteId[];
	}): Promise<void | { kind: 'failure'; message: string }> {
		const input = this.submitted;
		if (!input) return;
		try {
			const resources = workspaceSession.current?.resources;
			if (!resources) throw new Error('Open the workspace before replacing text');
			// Capture every reviewed body before the first asynchronous local write.
			const edits = this.hits
				.filter(
					(hit) => hit.matches.length && (!scope.noteIds || scope.noteIds.includes(hit.noteId))
				)
				.map((hit) => {
					const draft = resources.draft({ type: 'notes', id: [hit.noteId] });
					draft.capture();
					const note = draft.value;
					if (!note)
						throw new Error('A matching note is unavailable. Search again before replacing.');
					const result = replaceInNoteDocument(note.document, input.query, this.replacement, input);
					return { draft, note, result };
				});
			let replacedNotes = 0;
			let replacedMatches = 0;
			for (const { draft, note, result } of edits) {
				if (!result) continue;
				const saved = await draft.stage(
					noteWrite({ ...note, document: result.document, plainText: result.plainText })
				);
				if (saved.kind === 'failure') throw new Error(saved.message);
				replacedNotes += 1;
				replacedMatches += result.replaced;
			}
			this.lastReplace = { replacedNotes, replacedMatches };
			this.searchError = undefined;
		} catch (error) {
			this.searchError = error instanceof Error ? error.message : 'Replace failed';
			return { kind: 'failure', message: this.searchError };
		}
	}
}

export const globalSearch = new GlobalSearchStore();

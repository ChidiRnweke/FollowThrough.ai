import { SvelteSet } from 'svelte/reactivity';
import {
	type Note,
	type NoteId,
	type NoteSearchHit,
	type SearchNoteTextInput,
	type ReplaceNoteTextOutput
} from '$lib/models/notes';
import { buildNoteSearchPattern, searchNoteTargets } from '$lib/services/notes/text-search';
import type { ProjectId } from '$lib/models/projects';
import { workspaceSession } from '$lib/stores/workspace/session.svelte';
import { replaceNoteDrafts } from '$lib/controllers/notes/replace';
import type { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';

const SEARCH_DEBOUNCE_MS = 300;

/** Search UI state shared by the panel and canvas. Results project the shared device records. */
export class GlobalSearchStore {
	constructor(
		private readonly currentWorkspace: () => WorkspaceResources | undefined = () =>
			workspaceSession.current?.resources
	) {}
	query = $state('');
	replacement = $state('');
	regex = $state(false);
	caseSensitive = $state(false);
	projectId = $state<ProjectId | undefined>(undefined);
	private submitted = $state<SearchNoteTextInput | null>(null);
	hits = $derived.by<readonly NoteSearchHit[]>(() => {
		const input = this.submitted;
		const resources = this.currentWorkspace();
		if (!input || !resources) return [];
		return searchNoteTargets(
			resources.views.notes.filter(
				(note) => !input.projectId || note.projectId === input.projectId
			),
			input.query,
			input
		);
	});
	partial = $derived.by(() => this.currentWorkspace()?.availability !== 'complete');
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

	async replaceAll(): Promise<void | { kind: 'failure'; message: string }> {
		return this.replace({});
	}

	async replaceInNote(noteId: NoteId): Promise<void | { kind: 'failure'; message: string }> {
		return this.replace({ noteIds: [noteId] });
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
			const resources = this.currentWorkspace();
			if (!resources) throw new Error('Open the workspace before replacing text');
			const drafts = this.hits
				.filter(
					(hit) => hit.matches.length && (!scope.noteIds || scope.noteIds.includes(hit.noteId))
				)
				.map((hit) => {
					const draft = resources.draft({ type: 'notes', id: [hit.noteId] });
					return {
						capture: () => draft.capture(),
						get value(): Note | null {
							return $state.snapshot(draft.value) as Note | null;
						},
						stage: (command: Parameters<typeof draft.stage>[0]) => draft.stage(command)
					};
				});
			const report = await replaceNoteDrafts(drafts, { ...input, replacement: this.replacement });
			this.lastReplace = {
				replacedNotes: report.saved.length,
				replacedMatches: report.saved.reduce((sum, note) => sum + note.matches, 0)
			};
			if (report.kind === 'failure') {
				this.searchError = `Saved replacements on this device in ${report.saved.length} ${report.saved.length === 1 ? 'note' : 'notes'}${report.saved.length ? ` (${report.saved.map((note) => note.title).join(', ')})` : ''}. Save not confirmed for "${report.failed.title}": ${report.failed.message}. ${report.unattempted.length} remaining ${report.unattempted.length === 1 ? 'note was' : 'notes were'} not attempted. Review the saved changes before searching again.`;
				return { kind: 'failure', message: this.searchError };
			}
			this.searchError = undefined;
		} catch (error) {
			this.searchError = error instanceof Error ? error.message : 'Replace failed';
			return { kind: 'failure', message: this.searchError };
		}
	}
}

export const globalSearch = new GlobalSearchStore();

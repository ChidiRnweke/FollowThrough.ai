import type {
	Note,
	NoteId,
	NoteSearchHit,
	SearchNoteTextInput,
	ReplaceNoteTextOutput
} from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { SyncScheduler } from '$lib/models/sync';
import type { NoteTextSearch } from '$lib/services/notes/text-search';
import type { NoteReplacementController } from '$lib/controllers/notes/replace';
import type { WorkspaceResourcesController } from '$lib/controllers/workspace/resources';
import type { GlobalSearchStore } from '$lib/stores/search/global-search.svelte';
export interface SearchDraftCopy {
	copy(note: Note): Note;
}
export interface GlobalSearchController {
	readonly query: string;
	readonly replacement: string;
	readonly regex: boolean;
	readonly caseSensitive: boolean;
	readonly projectId: ProjectId | undefined;
	readonly hits: readonly NoteSearchHit[];
	readonly partial: boolean;
	readonly searching: boolean;
	readonly searchError: string | undefined;
	readonly lastReplace: ReplaceNoteTextOutput | undefined;
	readonly collapsedNoteIds: ReadonlySet<NoteId>;
	readonly totalMatches: number;
	edit(input: Partial<SearchNoteTextInput>): void;
	setReplacement(value: string): void;
	search(): Promise<void>;
	replaceAll(): Promise<void | { kind: 'failure'; message: string }>;
	replaceInNote(noteId: NoteId): Promise<void | { kind: 'failure'; message: string }>;
	toggleCollapsed(noteId: NoteId): void;
}
const SEARCH_DEBOUNCE_MS = 300;
export class GlobalSearch implements GlobalSearchController {
	constructor(
		private readonly state: GlobalSearchStore,
		private readonly currentWorkspace: () => WorkspaceResourcesController | undefined,
		private readonly rules: NoteTextSearch,
		private readonly replacements: NoteReplacementController,
		private readonly scheduler: SyncScheduler,
		private readonly documents: SearchDraftCopy
	) {}
	get query() {
		return this.state.input.query;
	}
	get replacement() {
		return this.state.replacement;
	}
	get regex() {
		return this.state.input.regex;
	}
	get caseSensitive() {
		return this.state.input.caseSensitive;
	}
	get projectId() {
		return this.state.input.projectId;
	}
	get hits(): readonly NoteSearchHit[] {
		const input = this.state.submitted;
		const resources = this.currentWorkspace();
		if (!input || !resources?.active) return [];
		return this.rules.search(
			resources.views.notes.filter(
				(note) => !input.projectId || note.projectId === input.projectId
			),
			input.query,
			input
		);
	}
	get partial() {
		return this.currentWorkspace()?.availability !== 'complete';
	}
	get searching() {
		const resources = this.currentWorkspace();
		return (
			this.state.searching &&
			resources === this.state.pendingWorkspace &&
			(resources === undefined || resources.active)
		);
	}
	get searchError() {
		return this.currentWorkspace() === this.state.resultWorkspace &&
			(this.state.resultWorkspace === undefined || this.state.resultWorkspace.active)
			? this.state.searchError
			: undefined;
	}
	get lastReplace() {
		return this.currentWorkspace() === this.state.resultWorkspace &&
			(this.state.resultWorkspace === undefined || this.state.resultWorkspace.active)
			? this.state.lastReplace
			: undefined;
	}
	get collapsedNoteIds(): ReadonlySet<NoteId> {
		return this.state.collapsedNoteIds;
	}
	get totalMatches() {
		return this.hits.reduce(
			(count, hit) => count + hit.titleMatches.length + hit.matches.length,
			0
		);
	}
	edit(input: Partial<SearchNoteTextInput>): void {
		this.state.setInput({ ...this.state.input, ...input });
		this.state.clearReplacement();
		const workspace = this.currentWorkspace();
		this.state.setSearching(true, workspace);
		this.state.cancelTimer?.();
		this.state.setTimer(
			this.scheduler.schedule(this.scheduler.now() + SEARCH_DEBOUNCE_MS, () =>
				this.currentWorkspace() === workspace && (workspace === undefined || workspace.active)
					? this.search()
					: Promise.resolve()
			)
		);
	}
	setReplacement(value: string): void {
		this.state.setReplacement(value);
	}
	search(): Promise<void> {
		this.state.cancelTimer?.();
		this.state.setTimer(undefined);
		const input = this.state.input;
		const submitted = input.query && this.rules.valid(input.query, input) ? input : null;
		this.state.submit(
			submitted,
			input.query && !submitted
				? 'The search pattern is not a valid regular expression'
				: undefined,
			this.currentWorkspace()
		);
		return Promise.resolve();
	}
	replaceAll() {
		return this.replace({});
	}
	replaceInNote(noteId: NoteId) {
		return this.replace({ noteIds: [noteId] });
	}
	toggleCollapsed(noteId: NoteId): void {
		this.state.setCollapsed(noteId, !this.state.collapsedNoteIds.has(noteId));
	}
	private async replace(scope: {
		noteIds?: NoteId[];
	}): Promise<void | { kind: 'failure'; message: string }> {
		const input = this.state.submitted;
		if (!input) return;
		const resources = this.currentWorkspace();
		const current = () =>
			this.currentWorkspace() === resources && (resources === undefined || resources.active);
		try {
			if (!resources) throw new Error('Open the workspace before replacing text');
			const drafts = this.hits
				.filter(
					(hit) => hit.matches.length && (!scope.noteIds || scope.noteIds.includes(hit.noteId))
				)
				.map((hit) => {
					const draft = resources.draft({ type: 'notes', id: [hit.noteId] });
					const documents = this.documents;
					return {
						capture: () => draft.capture(),
						get value(): Note | null {
							const value = draft.value;
							return value ? documents.copy(value) : null;
						},
						stage: (command: Parameters<typeof draft.stage>[0]) =>
							current()
								? draft.stage(command)
								: Promise.resolve({
										kind: 'failure' as const,
										message: 'The workspace account changed during replacement'
									})
					};
				});
			const report = await this.replacements.replace(drafts, {
				...input,
				replacement: this.replacement
			});
			if (!current())
				return { kind: 'failure', message: 'The workspace account changed during replacement' };
			const result = {
				replacedNotes: report.saved.length,
				replacedMatches: report.saved.reduce((sum, note) => sum + note.matches, 0)
			};
			if (report.kind === 'failure') {
				const message = `Saved replacements on this device in ${report.saved.length} ${report.saved.length === 1 ? 'note' : 'notes'}${report.saved.length ? ` (${report.saved.map((note) => note.title).join(', ')})` : ''}. Save not confirmed for "${report.failed.title}": ${report.failed.message}. ${report.unattempted.length} remaining ${report.unattempted.length === 1 ? 'note was' : 'notes were'} not attempted. Review the saved changes before searching again.`;
				this.state.completeReplacement(result, message, resources);
				return { kind: 'failure', message };
			}
			this.state.completeReplacement(result, undefined, resources);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Replace failed';
			if (current()) this.state.completeReplacement(undefined, message, resources);
			return { kind: 'failure', message };
		}
	}
}

import type {
	Note,
	NoteId,
	NoteSearchHit,
	SearchNoteTextInput,
	ReplaceNoteTextOutput
} from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { SyncScheduler } from '$lib/models/sync';
import type { WorkspaceBatch } from '$lib/models/workspace-editing';
import type { PreparedWorkspaceCommand } from '$lib/models/workspace-mutations';
import type { NoteTextSearch } from '$lib/services/notes/text-search';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';
import type { GlobalSearchStore } from '$lib/stores/search/global-search.svelte';

/** One note's replacement: the note as searched and the save that rewrites its matches. */
export interface PlannedReplacement {
	readonly noteId: NoteId;
	readonly title: string;
	readonly matches: number;
	readonly command: PreparedWorkspaceCommand;
}
/**
 * Search the notes on this device and plan replacements. The workspace stores a plan; this
 * controller reports what it stored.
 */
export interface GlobalSearchController {
	readonly query: string;
	readonly replacement: string;
	readonly regex: boolean;
	readonly caseSensitive: boolean;
	readonly projectId: ProjectId | undefined;
	readonly searching: boolean;
	readonly searchError: string | undefined;
	readonly lastReplace: ReplaceNoteTextOutput | undefined;
	readonly collapsedNoteIds: ReadonlySet<NoteId>;
	hits(notes: readonly Note[]): readonly NoteSearchHit[];
	edit(input: Partial<SearchNoteTextInput>): void;
	setReplacement(value: string): void;
	search(): Promise<void>;
	/** The replacements for every hit, or for one note's hits. */
	plan(notes: readonly Note[], noteId?: NoteId): readonly PlannedReplacement[];
	/** Report what the workspace stored of a plan. */
	replaced(
		plan: readonly PlannedReplacement[],
		outcome: WorkspaceBatch
	): void | { kind: 'failure'; message: string };
	toggleCollapsed(noteId: NoteId): void;
}
const SEARCH_DEBOUNCE_MS = 300;
export class GlobalSearch implements GlobalSearchController {
	constructor(
		private readonly state: GlobalSearchStore,
		private readonly rules: NoteTextSearch,
		private readonly commands: WorkspaceCommandRules,
		private readonly scheduler: SyncScheduler
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
	get searching() {
		return this.state.searching;
	}
	get searchError() {
		return this.state.searchError;
	}
	get lastReplace() {
		return this.state.lastReplace;
	}
	get collapsedNoteIds(): ReadonlySet<NoteId> {
		return this.state.collapsedNoteIds;
	}
	hits(notes: readonly Note[]): readonly NoteSearchHit[] {
		const input = this.state.submitted;
		if (!input) return [];
		return this.rules.search(
			notes.filter((note) => !input.projectId || note.projectId === input.projectId),
			input.query,
			input
		);
	}
	edit(input: Partial<SearchNoteTextInput>): void {
		this.state.setInput({ ...this.state.input, ...input });
		this.state.clearReplacement();
		this.state.setSearching(true);
		this.state.cancelTimer?.();
		this.state.setTimer(
			this.scheduler.schedule(this.scheduler.now() + SEARCH_DEBOUNCE_MS, () => this.search())
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
			input.query && !submitted ? 'The search pattern is not a valid regular expression' : undefined
		);
		return Promise.resolve();
	}
	plan(notes: readonly Note[], noteId?: NoteId): readonly PlannedReplacement[] {
		const input = this.state.submitted;
		if (!input) return [];
		const matching = new Set(
			this.hits(notes)
				.filter((hit) => hit.matches.length && (!noteId || hit.noteId === noteId))
				.map((hit) => hit.noteId)
		);
		return notes.flatMap((note) => {
			if (!matching.has(note.id)) return [];
			const replaced = this.rules.replace(note.document, input.query, this.replacement, input);
			if (!replaced) return [];
			return [
				{
					noteId: note.id,
					title: note.title,
					matches: replaced.replaced,
					command: this.commands.noteCommand({
						...note,
						document: replaced.document,
						plainText: replaced.plainText
					})
				}
			];
		});
	}
	replaced(
		plan: readonly PlannedReplacement[],
		outcome: WorkspaceBatch
	): void | { kind: 'failure'; message: string } {
		const saved = plan.slice(0, outcome.saved);
		const result = {
			replacedNotes: saved.length,
			replacedMatches: saved.reduce((sum, note) => sum + note.matches, 0)
		};
		if (outcome.kind === 'complete') {
			this.state.completeReplacement(result, undefined);
			return;
		}
		const failed = plan[outcome.saved];
		const remaining = plan.length - outcome.saved - 1;
		const message = failed
			? `Saved replacements on this device in ${saved.length} ${saved.length === 1 ? 'note' : 'notes'}${saved.length ? ` (${saved.map((note) => note.title).join(', ')})` : ''}. Save not confirmed for "${failed.title}": ${outcome.message}. ${remaining} remaining ${remaining === 1 ? 'note was' : 'notes were'} not attempted. Review the saved changes before searching again.`
			: outcome.message;
		this.state.completeReplacement(failed ? result : undefined, message);
		return { kind: 'failure', message };
	}
	toggleCollapsed(noteId: NoteId): void {
		this.state.setCollapsed(noteId, !this.state.collapsedNoteIds.has(noteId));
	}
}

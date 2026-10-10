import type { NoteHistoryReader } from '$lib/models/browser-workspace';
import type {
	NoteHistoryReadState,
	NoteId,
	NoteRevision,
	NoteRevisionId,
	NoteRevisionSummary
} from '$lib/models/notes';
import type { NotePresentation } from '$lib/services/notes/presentation';
import type { NoteHistoryStore } from '$lib/stores/notes/history.svelte';
import type { NoteActionWorkspace } from './actions';
export type { NoteHistoryReader } from '$lib/models/browser-workspace';

export interface NoteHistoryController {
	readonly revisions: readonly NoteRevisionSummary[];
	readonly selectedId: NoteRevisionId | undefined;
	readonly selected: NoteRevision | undefined;
	readonly readState: NoteHistoryReadState;
	open(): Promise<void>;
	select(revisionId: NoteRevisionId): Promise<void>;
	cancel(): void;
}
export class NoteHistory implements NoteHistoryController {
	constructor(
		private readonly noteId: NoteId,
		private readonly state: NoteHistoryStore,
		private readonly workspace: NoteActionWorkspace,
		private readonly reader: NoteHistoryReader,
		private readonly presentation: NotePresentation
	) {}
	private get active(): boolean {
		return this.state.binding === this.workspace.current;
	}
	get revisions(): readonly NoteRevisionSummary[] {
		return this.active ? this.state.revisions : [];
	}
	get selectedId(): NoteRevisionId | undefined {
		return this.active ? this.state.selectedId : undefined;
	}
	get selected(): NoteRevision | undefined {
		return this.active ? this.state.selected : undefined;
	}
	get readState(): NoteHistoryReadState {
		return this.state.readState;
	}
	cancel(): void {
		this.state.invalidate();
	}
	async open(): Promise<void> {
		const request = this.state.begin(this.workspace.current);
		this.state.setRevisions([]);
		const result = await this.reader.list(this.noteId).then(
			(revisions) => ({ kind: 'ready' as const, revisions }),
			(): { kind: 'failure'; message: string } => {
				return {
					kind: 'failure',
					message: 'Could not load the version history. Close this dialog and try again.'
				};
			}
		);
		if (!this.active || request !== this.state.generation) return;
		if (result.kind === 'failure') {
			this.state.setReadState(result);
			return;
		}
		this.state.setRevisions(result.revisions);
		const preferred = this.presentation.preferredRevision(result.revisions);
		if (preferred) await this.select(preferred.id);
		else this.state.setReadState({ kind: 'ready' });
	}
	async select(revisionId: NoteRevisionId): Promise<void> {
		const request = this.state.begin(this.workspace.current, revisionId);
		const result = await this.reader.read(this.noteId, revisionId).then(
			(revision) => ({ kind: 'ready' as const, revision }),
			(): { kind: 'failure'; message: string } => {
				return {
					kind: 'failure',
					message: 'Could not load that version. Close this dialog and try again.'
				};
			}
		);
		if (!this.active || request !== this.state.generation) return;
		if (result.kind === 'failure') {
			this.state.setReadState(result);
			return;
		}
		this.state.setSelected(result.revision);
		this.state.setReadState({ kind: 'ready' });
	}
}

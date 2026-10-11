import type {
	NoteRevision,
	NoteRevisionId,
	NoteRevisionSummary,
	NoteHistoryReadState
} from '$lib/models/notes';

export class NoteHistoryStore {
	private request = 0;
	private revisionsValue = $state<readonly NoteRevisionSummary[]>([]);
	private selectedIdValue = $state<NoteRevisionId | undefined>();
	private selectedValue = $state<NoteRevision | undefined>();
	private readStateValue = $state<NoteHistoryReadState>({ kind: 'ready' });
	get generation(): number {
		return this.request;
	}
	get revisions(): readonly NoteRevisionSummary[] {
		return this.revisionsValue;
	}
	get selectedId(): NoteRevisionId | undefined {
		return this.selectedIdValue;
	}
	get selected(): NoteRevision | undefined {
		return this.selectedValue;
	}
	get readState(): NoteHistoryReadState {
		return this.readStateValue;
	}
	invalidate(): void {
		this.request++;
	}
	begin(selectedId?: NoteRevisionId): number {
		this.selectedIdValue = selectedId;
		this.selectedValue = undefined;
		this.readStateValue = { kind: 'loading' };
		return ++this.request;
	}
	setRevisions(revisions: readonly NoteRevisionSummary[]): void {
		this.revisionsValue = revisions;
	}
	setSelected(revision: NoteRevision): void {
		this.selectedValue = revision;
	}
	setReadState(state: NoteHistoryReadState): void {
		this.readStateValue = state;
	}
}

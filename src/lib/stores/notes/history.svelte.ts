import type {
	NoteRevision,
	NoteRevisionId,
	NoteRevisionSummary,
	NoteHistoryReadState
} from '$lib/models/notes';
import type { NoteActionSession } from '$lib/controllers/notes/actions';

export class NoteHistoryStore {
	private request = 0;
	private revisionsValue = $state<readonly NoteRevisionSummary[]>([]);
	private selectedIdValue = $state<NoteRevisionId | undefined>();
	private selectedValue = $state<NoteRevision | undefined>();
	private readStateValue = $state<NoteHistoryReadState>({ kind: 'ready' });
	private bindingValue = $state.raw<NoteActionSession | null>(null);
	get generation(): number {
		return this.request;
	}
	get binding(): NoteActionSession | null {
		return this.bindingValue;
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
	begin(binding: NoteActionSession | null, selectedId?: NoteRevisionId): number {
		this.bindingValue = binding;
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

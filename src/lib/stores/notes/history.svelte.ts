import type { NoteId, NoteRevision, NoteRevisionId, NoteRevisionSummary } from '$lib/models/notes';

export type NoteHistoryReadState =
	{ kind: 'ready' } | { kind: 'loading' } | { kind: 'failure'; message: string };

/** The revision list and comparison selected by one open note pane. */
export class NoteHistory {
	private request = 0;
	cancel(): void {
		this.request++;
	}
	revisions = $state<readonly NoteRevisionSummary[]>([]);
	selectedId = $state<NoteRevisionId | undefined>(undefined);
	selected = $state<NoteRevision | undefined>(undefined);
	readState = $state<NoteHistoryReadState>({ kind: 'ready' });
	constructor(
		private readonly noteId: NoteId,
		private readonly list: (noteId: NoteId) => Promise<readonly NoteRevisionSummary[]>,
		private readonly read: (noteId: NoteId, revisionId: NoteRevisionId) => Promise<NoteRevision>
	) {}
	async open(): Promise<void> {
		const request = ++this.request;
		this.revisions = [];
		this.selectedId = undefined;
		this.selected = undefined;
		this.readState = { kind: 'loading' };
		const result = await this.list(this.noteId).then(
			(revisions) => ({ kind: 'ready' as const, revisions }),
			(): { kind: 'failure'; message: string } => {
				return {
					kind: 'failure',
					message: 'Could not load the version history. Close this dialog and try again.'
				};
			}
		);
		if (request !== this.request) return;
		if (result.kind === 'failure') {
			this.readState = result;
			return;
		}
		this.revisions = result.revisions;
		const preferred =
			result.revisions.find((revision) => revision.isPublished) ?? result.revisions.at(0);
		if (preferred) await this.select(preferred.id);
		else this.readState = { kind: 'ready' };
	}
	async select(revisionId: NoteRevisionId): Promise<void> {
		const request = ++this.request;
		this.selectedId = revisionId;
		this.selected = undefined;
		this.readState = { kind: 'loading' };
		const result = await this.read(this.noteId, revisionId).then(
			(revision) => ({ kind: 'ready' as const, revision }),
			(): { kind: 'failure'; message: string } => {
				return {
					kind: 'failure',
					message: 'Could not load that version. Close this dialog and try again.'
				};
			}
		);
		if (request !== this.request) return;
		if (result.kind === 'failure') {
			this.readState = result;
			return;
		}
		this.selected = result.revision;
		this.readState = { kind: 'ready' };
	}
}

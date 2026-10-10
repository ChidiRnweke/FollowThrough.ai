import { noteEtag, type NoteView, type NoteRevisionSummary } from '$lib/models/notes';

export interface NotePresentation {
	assemble<Backlink, Reference, Diagram, Task, Proposal>(
		facts: Omit<NoteView<Backlink, Reference, Diagram, Task, Proposal>, 'etag'>
	): NoteView<Backlink, Reference, Diagram, Task, Proposal>;
	preferredRevision(revisions: readonly NoteRevisionSummary[]): NoteRevisionSummary | undefined;
}
export class NotePresentationService implements NotePresentation {
	assemble<Backlink, Reference, Diagram, Task, Proposal>(
		facts: Omit<NoteView<Backlink, Reference, Diagram, Task, Proposal>, 'etag'>
	): NoteView<Backlink, Reference, Diagram, Task, Proposal> {
		return { ...facts, etag: noteEtag(facts.note.id, facts.note.currentRevision) };
	}
	preferredRevision(revisions: readonly NoteRevisionSummary[]): NoteRevisionSummary | undefined {
		return revisions.find((revision) => revision.isPublished) ?? revisions.at(0);
	}
}

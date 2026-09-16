import type { Note, NoteEtag, NoteView } from '$lib/models/notes';

export const noteEtag = (note: Pick<Note, 'id' | 'currentRevision'>): NoteEtag =>
	`note:${note.id}:r${note.currentRevision}` as NoteEtag;

export const noteMatchesEtag = (
	note: Pick<Note, 'id' | 'currentRevision'>,
	etag: NoteEtag
): boolean => noteEtag(note) === etag;

/** Assemble the same note surface from server records or downloaded records. */
export function assembleNoteView<Backlink, Reference, Diagram, Task, Proposal>(
	facts: Omit<NoteView<Backlink, Reference, Diagram, Task, Proposal>, 'etag'>
): NoteView<Backlink, Reference, Diagram, Task, Proposal> {
	return { ...facts, etag: noteEtag(facts.note) };
}

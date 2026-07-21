import type { NoteId, NoteSummary } from '$lib/models';

export const NOTE_DRAG_MIME = 'application/x-followthrough-note-id';

const hasNoteType = (dataTransfer: DataTransfer): boolean =>
	Array.from(dataTransfer.types).includes(NOTE_DRAG_MIME);

export function writeNoteDrag(dataTransfer: DataTransfer, noteId: NoteId): void {
	dataTransfer.effectAllowed = 'copy';
	dataTransfer.setData(NOTE_DRAG_MIME, noteId);
}

export function hasInternalNoteDrag(dataTransfer: DataTransfer | null): boolean {
	return dataTransfer !== null && hasNoteType(dataTransfer);
}

export function readActiveNoteDrag(
	dataTransfer: DataTransfer | null,
	noteTree: readonly NoteSummary[]
): NoteId | undefined {
	if (!dataTransfer || !hasNoteType(dataTransfer)) return undefined;
	const noteId = dataTransfer.getData(NOTE_DRAG_MIME);
	const note = noteTree.find((entry) => entry.id === noteId);
	return note?.kind === 'note' && !note.archivedAt ? note.id : undefined;
}

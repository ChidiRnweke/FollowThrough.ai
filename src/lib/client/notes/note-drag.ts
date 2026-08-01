import type { NoteId, NoteSummary } from '$lib/models/notes';

export const NOTE_DRAG_MIME = 'application/x-followthrough-note-id';

export interface NoteDragTransfer {
	effectAllowed: string;
	readonly types: Iterable<string> | ArrayLike<string>;
	setData(type: string, value: string): void;
	getData(type: string): string;
}

const hasNoteType = (dataTransfer: NoteDragTransfer): boolean =>
	Array.from(dataTransfer.types).includes(NOTE_DRAG_MIME);

export function writeNoteDrag(dataTransfer: NoteDragTransfer, noteId: NoteId): void {
	dataTransfer.effectAllowed = 'copy';
	dataTransfer.setData(NOTE_DRAG_MIME, noteId);
}

export function hasInternalNoteDrag(dataTransfer: NoteDragTransfer | null): boolean {
	return dataTransfer !== null && hasNoteType(dataTransfer);
}

export function readActiveNoteDrag(
	dataTransfer: NoteDragTransfer | null,
	noteTree: readonly NoteSummary[]
): NoteId | undefined {
	if (!dataTransfer || !hasNoteType(dataTransfer)) return undefined;
	const noteId = dataTransfer.getData(NOTE_DRAG_MIME);
	const note = noteTree.find((entry) => entry.id === noteId);
	return note?.kind === 'note' && !note.archivedAt ? note.id : undefined;
}

import type { Note } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';

/** Facts needed to archive a note; document content does not affect this decision. */
function decideNoteArchive(
	note: Pick<Note, 'kind' | 'archivedAt'>,
	hasActiveChildren: boolean
): { kind: 'allowed' } | { kind: 'invalid'; message: string } {
	if (note.archivedAt) return { kind: 'invalid', message: 'The note is already archived' };
	if (note.kind === 'folder' && hasActiveChildren)
		return { kind: 'invalid', message: 'A folder with active contents cannot be archived' };
	return { kind: 'allowed' };
}

/** A missing or archived parent sends a restored note to the end of its project root. */
export function decideNoteRestore(
	note: Pick<Note, 'parentId' | 'position' | 'archivedAt'>,
	parent: Pick<Note, 'archivedAt'> | null
): { kind: 'invalid'; message: string } | { kind: 'restore'; placement: 'keep' | 'root' } {
	if (!note.archivedAt) return { kind: 'invalid', message: 'The note is not archived' };
	return {
		kind: 'restore',
		placement: note.parentId && (!parent || parent.archivedAt) ? 'root' : 'keep'
	};
}

/** Resolve one trash transition before either browser or server persistence. */
export function noteTrashChange(
	note: Note,
	action:
		| { readonly kind: 'archive'; readonly hasActiveChildren: boolean }
		| { readonly kind: 'restore'; readonly parent: Note | null; readonly rootSiblingCount: number },
	timestamp: DateTime
):
	| { readonly kind: 'invalid'; readonly message: string }
	| { readonly kind: 'change'; readonly note: Note } {
	if (action.kind === 'archive') {
		const decision = decideNoteArchive(note, action.hasActiveChildren);
		if (decision.kind === 'invalid') return decision;
		return { kind: 'change', note: { ...note, archivedAt: timestamp, updatedAt: timestamp } };
	}
	const decision = decideNoteRestore(note, action.parent);
	if (decision.kind === 'invalid') return decision;
	const { archivedAt, ...rest } = note;
	void archivedAt;
	if (decision.placement === 'keep')
		return { kind: 'change', note: { ...rest, updatedAt: timestamp } };
	const { parentId, ...detached } = rest;
	void parentId;
	return {
		kind: 'change',
		note: { ...detached, position: action.rootSiblingCount, updatedAt: timestamp }
	};
}

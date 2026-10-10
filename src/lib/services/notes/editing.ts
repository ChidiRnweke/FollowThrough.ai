import { type ProseMirrorNode, type Note, type NoteSaveWrite } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import { StaleRevisionError, ValidationError } from '$lib/errors';

/** Apply authored fields while retaining the revision the editor actually observed. */
const unreadableNode = (node: ProseMirrorNode): boolean =>
	node.type === 'unknown' || ('content' in node && (node.content ?? []).some(unreadableNode));

export interface NoteEditingRules {
	edit(
		note: Note,
		input: Pick<Note, 'document' | 'plainText'> & Partial<Pick<Note, 'title' | 'isPinned'>>,
		timestamp: DateTime
	): Note;
	sameDraft(current: Note, candidate: Note): boolean;
	prepareSave(
		current: Note,
		candidate: Note,
		timestamp: DateTime
	):
		| { readonly kind: 'unchanged'; readonly note: Note }
		| { readonly kind: 'write'; readonly write: NoteSaveWrite };
}
export class NoteEditingService implements NoteEditingRules {
	edit(
		note: Note,
		input: Pick<Note, 'document' | 'plainText'> & Partial<Pick<Note, 'title' | 'isPinned'>>,
		timestamp: DateTime
	): Note {
		return {
			...note,
			document: input.document,
			plainText: input.plainText,
			...(input.title !== undefined ? { title: input.title.trim() } : {}),
			...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
			updatedAt: timestamp
		};
	}
	sameDraft(current: Note, candidate: Note): boolean {
		return (
			current.title === candidate.title &&
			current.plainText === candidate.plainText &&
			JSON.stringify(current.document) === JSON.stringify(candidate.document) &&
			current.isPinned === candidate.isPinned
		);
	}
	prepareSave(
		current: Note,
		candidate: Note,
		timestamp: DateTime
	):
		| { readonly kind: 'unchanged'; readonly note: Note }
		| { readonly kind: 'write'; readonly write: NoteSaveWrite } {
		if (!candidate.title.trim()) throw new ValidationError('Note title is required');
		if ((candidate.document.content ?? []).some(unreadableNode))
			throw new ValidationError('Unreadable document blocks cannot be saved');
		if (current.archivedAt) throw new ValidationError('Archived notes cannot be edited');
		if (candidate.projectId !== current.projectId || candidate.kind !== current.kind)
			throw new ValidationError('A save cannot move a note between projects or change its kind');
		if (
			candidate.kind === 'folder' &&
			(candidate.plainText.trim() || candidate.document.content?.length)
		)
			throw new ValidationError('Folders cannot contain authored document content');
		if (candidate.currentRevision !== current.currentRevision)
			throw new StaleRevisionError('The note has changed since it was loaded');
		if (this.sameDraft(current, candidate)) return { kind: 'unchanged', note: current };
		return {
			kind: 'write',
			write: {
				note: {
					...this.edit(current, candidate, timestamp),
					currentRevision: current.currentRevision + 1
				},
				expectedRevision: current.currentRevision
			}
		};
	}
}

import type { Note, NoteCreationIntent, NoteCreationFacts } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';

export function decideNoteCreation(
	input: NoteCreationIntent,
	facts: NoteCreationFacts,
	timestamp: DateTime
):
	| { kind: 'create'; note: Note }
	| { kind: 'invalid'; code: 'VALIDATION' | 'NOT_FOUND'; message: string } {
	const title = input.title.trim();
	if (!title)
		return {
			kind: 'invalid',
			code: 'VALIDATION',
			message: input.kind === 'folder' ? 'Folder name is required' : 'Note title is required'
		};
	if (facts.project.archivedAt)
		return {
			kind: 'invalid',
			code: 'VALIDATION',
			message: 'An archived project cannot receive new notes'
		};
	if (input.parentId) {
		if (!facts.parent || facts.parent.projectId !== facts.project.id)
			return { kind: 'invalid', code: 'NOT_FOUND', message: 'An active parent folder is required' };
		if (facts.parent.kind !== 'folder')
			return { kind: 'invalid', code: 'VALIDATION', message: 'A parent must be a folder' };
		if (facts.parent.archivedAt)
			return {
				kind: 'invalid',
				code: 'VALIDATION',
				message: 'An active parent folder is required'
			};
	}
	return {
		kind: 'create',
		note: {
			id: input.id,
			userId: facts.project.userId,
			projectId: facts.project.id,
			parentId: input.parentId,
			kind: input.kind,
			title,
			position: facts.siblingCount,
			document: { type: 'doc', content: [] },
			plainText: '',
			currentRevision: 1,
			publishedRevision: 0,
			isPinned: false,
			createdAt: timestamp,
			updatedAt: timestamp
		}
	};
}

import type {
	Note,
	NoteCreationIntent,
	NoteCreationFacts,
	NotePublicationWrite
} from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import { ValidationError } from '$lib/errors';
export interface NoteCreationRules {
	decideCreation(
		input: NoteCreationIntent,
		facts: NoteCreationFacts,
		timestamp: DateTime
	):
		| { kind: 'create'; note: Note }
		| { kind: 'invalid'; code: 'VALIDATION' | 'NOT_FOUND'; message: string };
}
export interface NoteTrashRules {
	restorePlacement(
		note: Pick<Note, 'parentId' | 'position' | 'archivedAt'>,
		parent: Pick<Note, 'archivedAt'> | null
	): { kind: 'invalid'; message: string } | { kind: 'restore'; placement: 'keep' | 'root' };
	changeTrash(
		note: Note,
		action:
			| { readonly kind: 'archive'; readonly hasActiveChildren: boolean }
			| {
					readonly kind: 'restore';
					readonly parent: Note | null;
					readonly rootSiblingCount: number;
			  },
		timestamp: DateTime
	):
		| { readonly kind: 'invalid'; readonly message: string }
		| { readonly kind: 'change'; readonly note: Note };
}
export interface NotePublicationRules {
	preparePublication(note: Note, timestamp: DateTime): NotePublicationWrite;
}
function decideNoteArchive(
	note: Pick<Note, 'kind' | 'archivedAt'>,
	hasActiveChildren: boolean
): { kind: 'allowed' } | { kind: 'invalid'; message: string } {
	if (note.archivedAt) return { kind: 'invalid', message: 'The note is already archived' };
	if (note.kind === 'folder' && hasActiveChildren)
		return { kind: 'invalid', message: 'A folder with active contents cannot be archived' };
	return { kind: 'allowed' };
}
function decideNoteRestore(
	note: Pick<Note, 'parentId' | 'position' | 'archivedAt'>,
	parent: Pick<Note, 'archivedAt'> | null
): { kind: 'invalid'; message: string } | { kind: 'restore'; placement: 'keep' | 'root' } {
	if (!note.archivedAt) return { kind: 'invalid', message: 'The note is not archived' };
	return {
		kind: 'restore',
		placement: note.parentId && (!parent || parent.archivedAt) ? 'root' : 'keep'
	};
}
export class NoteLifecycleService
	implements NoteCreationRules, NoteTrashRules, NotePublicationRules
{
	decideCreation(
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
				return {
					kind: 'invalid',
					code: 'NOT_FOUND',
					message: 'An active parent folder is required'
				};
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
	changeTrash(
		note: Note,
		action:
			| { readonly kind: 'archive'; readonly hasActiveChildren: boolean }
			| {
					readonly kind: 'restore';
					readonly parent: Note | null;
					readonly rootSiblingCount: number;
			  },
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
	preparePublication(note: Note, timestamp: DateTime): NotePublicationWrite {
		if (note.archivedAt) throw new ValidationError('Archived notes cannot be published');
		return {
			noteId: note.id,
			expectedRevision: note.currentRevision,
			publishedRevision: note.currentRevision,
			publishedAt: timestamp,
			updatedAt: timestamp
		};
	}
	restorePlacement(
		note: Pick<Note, 'parentId' | 'position' | 'archivedAt'>,
		parent: Pick<Note, 'archivedAt'> | null
	): { kind: 'invalid'; message: string } | { kind: 'restore'; placement: 'keep' | 'root' } {
		return decideNoteRestore(note, parent);
	}
}

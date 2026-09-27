import type { NoteId, NoteSummary } from '$lib/models/notes';
import { ValidationError } from '$lib/errors';

/** Follow the actual parent chain, including a parent whose body has not arrived yet. */
export function ancestorFolderIds(
	note: Pick<NoteSummary, 'id' | 'parentId'>,
	entries: ReadonlyMap<NoteId, Pick<NoteSummary, 'parentId'>>
): readonly NoteId[] {
	const ancestors: NoteId[] = [];
	const visited = new Set<NoteId>([note.id]);
	let parentId = note.parentId;
	while (parentId) {
		if (visited.has(parentId)) throw new ValidationError('Project tree contains a parent cycle');
		visited.add(parentId);
		ancestors.push(parentId);
		parentId = entries.get(parentId)?.parentId;
	}
	return ancestors;
}

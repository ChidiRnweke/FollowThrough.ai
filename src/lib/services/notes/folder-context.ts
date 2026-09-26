import type { FolderContextResolution, NoteId, NoteSummary } from '$lib/models/notes';

/** All live content below a folder. Provider token budgets do not change this selection. */
export function folderNoteIds(noteTree: readonly NoteSummary[], folderId: NoteId): NoteId[] {
	const childrenOf = new Map<NoteId, NoteSummary[]>();
	for (const entry of noteTree) {
		if (entry.archivedAt || !entry.parentId) continue;
		const siblings = childrenOf.get(entry.parentId);
		if (siblings) siblings.push(entry);
		else childrenOf.set(entry.parentId, [entry]);
	}
	const found: NoteId[] = [];
	const pending: NoteId[] = [folderId];
	const seen = new Set<NoteId>([folderId]);
	for (let index = 0; index < pending.length; index++) {
		for (const child of childrenOf.get(pending[index]!) ?? []) {
			if (seen.has(child.id)) continue;
			seen.add(child.id);
			if (child.kind === 'folder') pending.push(child.id);
			else found.push(child.id);
		}
	}
	return found;
}

export function resolveFolderContext(
	noteTree: readonly NoteSummary[],
	folderIds: readonly NoteId[],
	availability: 'unknown' | 'complete'
): FolderContextResolution {
	if (folderIds.length === 0) return { kind: 'ready', noteIds: [] };
	if (availability !== 'complete') return { kind: 'incomplete' };
	const folders = new Set(
		noteTree
			.filter((entry) => entry.kind === 'folder' && !entry.archivedAt)
			.map((entry) => entry.id)
	);
	const noteIds = new Set<NoteId>();
	for (const folderId of folderIds) {
		if (!folders.has(folderId)) return { kind: 'missing', folderId };
		for (const noteId of folderNoteIds(noteTree, folderId)) noteIds.add(noteId);
	}
	return { kind: 'ready', noteIds: [...noteIds] };
}

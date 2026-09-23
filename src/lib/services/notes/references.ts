import type { NoteId, ProseMirrorDocument, ProseMirrorNode } from '$lib/models/notes';

function collectDrawioIds(node: ProseMirrorNode, ids: string[]): void {
	if (node.type === 'drawio') {
		const id = node.attrs?.diagramId;
		if (id && !ids.includes(id)) ids.push(id);
		return;
	}
	for (const child of 'content' in node ? (node.content ?? []) : []) collectDrawioIds(child, ids);
}

/** Every draw.io diagram referenced by a set of documents, in document order. */
export function drawioReferencesIn(
	documents: readonly { document: ProseMirrorDocument }[]
): string[] {
	const ids: string[] = [];
	for (const entry of documents)
		for (const node of entry.document.content ?? []) collectDrawioIds(node, ids);
	return ids;
}

/** Distinct note-link targets in document order; backlinks are derived from these authored links. */
export const collectNoteLinkTargets = (document: ProseMirrorDocument): readonly NoteId[] => {
	const found = new Set<NoteId>();
	const walk = (node: ProseMirrorNode): void => {
		if ('marks' in node)
			for (const mark of node.marks ?? []) {
				if (mark.type === 'noteLink' && mark.attrs?.noteId) found.add(mark.attrs.noteId as NoteId);
			}
		if ('content' in node) for (const child of node.content ?? []) walk(child);
	};
	for (const node of document.content ?? []) walk(node);
	return [...found];
};

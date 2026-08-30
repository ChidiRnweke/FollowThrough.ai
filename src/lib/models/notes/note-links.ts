type NoteId = string & { readonly __brand: 'NoteId' };
interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly ProseMirrorNodeView[];
}
interface ProseMirrorMarkView {
	readonly type: string;
	readonly attrs?: object;
}
interface ProseMirrorNodeView {
	readonly type: string;
	readonly attrs?: object;
	readonly marks?: readonly ProseMirrorMarkView[];
	readonly content?: readonly ProseMirrorNodeView[];
}

/**
 * Links from one note to another, as they exist in a document.
 *
 * The document is the source of truth for *where* a link is; the `noteRelationships` table
 * is a derived index that makes backlinks queryable. Reconciling the two means diffing
 * this against the stored rows, so the extraction has to be pure and usable on the server.
 */

/** Enough of a note to offer it as a link target. */
export interface NoteLinkTarget {
	readonly id: NoteId;
	readonly title: string;
}

/** True only for an image node whose source is this attachment's content endpoint. */
export const documentReferencesAttachment = (
	document: ProseMirrorDocument,
	attachmentId: string
): boolean => {
	const expectedSource = `/api/attachments/${attachmentId}/content`;
	let found = false;
	const walk = (node: ProseMirrorDocument | ProseMirrorNodeView): void => {
		if (found) return;
		if (
			node.type === 'image' &&
			node.attrs &&
			'src' in node.attrs &&
			node.attrs.src === expectedSource
		) {
			found = true;
			return;
		}
		for (const child of node.content ?? []) walk(child);
	};
	walk(document);
	return found;
};

/**
 * Every distinct note this document links to, in document order.
 *
 * Deduplicated: two links to the same note are one relationship, not two.
 */
export const collectNoteLinkTargets = (document: ProseMirrorDocument): readonly NoteId[] => {
	const found = new Set<NoteId>();

	const walk = (node: ProseMirrorDocument | ProseMirrorNodeView): void => {
		if ('marks' in node)
			for (const mark of node.marks ?? []) {
				if (mark.type !== 'noteLink') continue;
				if (!mark.attrs || !('noteId' in mark.attrs)) continue;
				const noteId = mark.attrs.noteId;
				if (typeof noteId === 'string' && noteId) found.add(noteId as NoteId);
			}
		for (const child of node.content ?? []) walk(child);
	};

	walk(document);
	return [...found];
};

/**
 * Resolve an Obsidian-style `[[Note Title]]` against a set of known titles.
 *
 * Used by the importer rather than the editor: a vault arriving as Markdown carries its
 * links in this form, and resolving them during the import that creates the notes is the
 * only moment every title is known at once. Matching is case-insensitive and ignores
 * surrounding whitespace, because vaults are inconsistent about both.
 *
 * Supports `[[Title|shown text]]`, keeping the shown text as the link label.
 */
export const WIKI_LINK_PATTERN = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

export const resolveWikiLinks = (markdown: string, titles: ReadonlyMap<string, NoteId>): string =>
	markdown.replace(WIKI_LINK_PATTERN, (whole, rawTitle: string, rawLabel?: string) => {
		const noteId = titles.get(rawTitle.trim().toLowerCase());
		const label = (rawLabel ?? rawTitle).trim();
		// An unresolved link stays as the author wrote it: inventing a dead link would be
		// worse than leaving text that still says what was meant.
		return noteId ? `[${label}](note:${noteId})` : whole;
	});

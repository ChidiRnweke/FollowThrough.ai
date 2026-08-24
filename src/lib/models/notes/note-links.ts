type NoteId = string & { readonly __brand: 'NoteId' };
interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly Readonly<Record<string, unknown>>[];
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

/** True only for an image node whose source is this attachment's content endpoint. */
export const documentReferencesAttachment = (
	document: ProseMirrorDocument | Record<string, unknown>,
	attachmentId: string
): boolean => {
	const expectedSource = `/api/attachments/${attachmentId}/content`;
	let found = false;
	const walk = (node: unknown): void => {
		if (found || !isRecord(node)) return;
		const attrs = node.attrs;
		if (node.type === 'image' && isRecord(attrs) && attrs.src === expectedSource) {
			found = true;
			return;
		}
		if (Array.isArray(node.content)) for (const child of node.content) walk(child);
	};
	walk(document);
	return found;
};

/**
 * Every distinct note this document links to, in document order.
 *
 * Deduplicated: two links to the same note are one relationship, not two.
 */
export const collectNoteLinkTargets = (
	document: ProseMirrorDocument | Record<string, unknown>
): readonly NoteId[] => {
	const found = new Set<NoteId>();

	const walk = (node: unknown): void => {
		if (!isRecord(node)) return;
		const marks = node.marks;
		if (Array.isArray(marks))
			for (const mark of marks) {
				if (!isRecord(mark) || mark.type !== 'noteLink') continue;
				const attrs = mark.attrs;
				const noteId = isRecord(attrs) ? attrs.noteId : undefined;
				if (typeof noteId === 'string' && noteId) found.add(noteId as NoteId);
			}
		const content = node.content;
		if (Array.isArray(content)) for (const child of content) walk(child);
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

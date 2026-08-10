import { getTextBetween, getTextSerializersFromSchema, type Editor } from '@tiptap/core';

/** The block separator the note's denormalized `plainText` uses between blocks. */
const BLOCK_SEPARATOR = '\n\n';

export interface PmTextRange {
	readonly from: number;
	readonly to: number;
}

/**
 * Maps a `[start, end)` range of the note's plain text to live ProseMirror positions,
 * so a search hit can be selected and lit in the editor. The walk reuses the editor's
 * own text serialization (`getTextBetween` with the same block separator the plain
 * text was derived with), so the mapping stays consistent however blocks nest: a
 * position's prefix length is the plain-text length of everything before it, and the
 * target offsets are binary-searched against it.
 *
 * A target that lands inside a block separator — possible when a regex match spans a
 * paragraph boundary — resolves to the text position just before it; the highlight
 * simply stops at the boundary. Returns `undefined` for ranges the document's text
 * cannot contain.
 */
export const plainTextRangeToPm = (
	editor: Editor,
	start: number,
	end: number
): PmTextRange | undefined => {
	const doc = editor.state.doc;
	const options = {
		blockSeparator: BLOCK_SEPARATOR,
		textSerializers: getTextSerializersFromSchema(editor.schema)
	};
	const prefixLength = (pos: number): number =>
		getTextBetween(doc, { from: 0, to: pos }, options).length;
	if (start < 0 || start >= end || end > prefixLength(doc.content.size)) return undefined;

	// Largest position whose covered plain-text length stays within the target.
	const positionAt = (target: number): number => {
		let lo = 0;
		let hi = doc.content.size;
		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2);
			if (prefixLength(mid) <= target) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	};

	const from = positionAt(start);
	const to = positionAt(end);
	return from < to ? { from, to } : undefined;
};

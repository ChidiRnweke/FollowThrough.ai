import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * Blank blocks the clipboard added, not the author.
 *
 * `handleMarkdownPaste` trims boundary blank lines, but only on the plain-text path — a
 * copy carrying `text/html` goes to ProseMirror's own clipboard parser instead, and that
 * parser keeps whatever empty blocks the source put at the edges. A web page's trailing
 * `<p><br></p>` and a selection dragged past the end of a paragraph both arrive as an
 * empty `paragraph` on the boundary, which lands in the note as a blank line above or
 * below the text that was actually copied.
 *
 * This runs as `transformPasted`, the last hook the clipboard parser calls, so every
 * paste path — plain text, foreign HTML and a copy out of this editor — is normalized in
 * one place.
 */

/** Whether every child of a textblock is a line break, so it renders as nothing. */
const onlyLineBreaks = (node: ProseMirrorNode): boolean => {
	let bare = true;
	node.content.forEach((child) => {
		if (child.type.name !== 'hardBreak') bare = false;
	});
	return bare;
};

/**
 * A block that renders as nothing.
 *
 * `<p><br></p>` counts: it is how a web page writes a blank line, and it reaches the
 * schema as a paragraph holding a `hardBreak` rather than as an empty one. Code blocks
 * are excluded — an empty fenced block is something the author wrote, and it is the one
 * textblock whose emptiness is content.
 */
const isBlankBlock = (node: ProseMirrorNode): boolean =>
	node.isTextblock && !node.type.spec.code && onlyLineBreaks(node);

/**
 * The open depth for a boundary whose blank block was just removed.
 *
 * An open boundary means "this continues the block it is pasted into". Removing a blank
 * block that was itself open hands that openness to the block behind it, so the pasted
 * text still merges into the caret's paragraph instead of splitting it — and closes the
 * boundary when the block behind it is not a textblock and could not have merged anyway.
 */
const depthBehind = (open: number, next: ProseMirrorNode | undefined): number =>
	open === 1 && next?.isTextblock ? 1 : 0;

/**
 * The same slice without the empty blocks on its edges, or the slice itself when it has
 * none. A slice that is blank all the way through is left alone: there is nothing better
 * to paste than what was copied.
 */
export const withoutBoundaryBlankBlocks = (slice: Slice): Slice => {
	const children: ProseMirrorNode[] = [];
	slice.content.forEach((child) => children.push(child));

	let start = 0;
	let end = children.length;
	let openStart = slice.openStart;
	let openEnd = slice.openEnd;

	// A depth past the boundary child reaches into content, so that child is not blank and
	// the loops stop on their own; the guard only spells out the invariant.
	while (openStart <= 1 && start < end && isBlankBlock(children[start])) {
		start += 1;
		openStart = depthBehind(openStart, children[start]);
	}
	while (openEnd <= 1 && end > start && isBlankBlock(children[end - 1])) {
		end -= 1;
		openEnd = depthBehind(openEnd, children[end - 1]);
	}

	if (start === 0 && end === children.length) return slice;
	if (start >= end) return slice;
	return new Slice(Fragment.fromArray(children.slice(start, end)), openStart, openEnd);
};

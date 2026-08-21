import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * Blank lines the clipboard carries, not lines the author wrote.
 *
 * A paragraph that ends in line breaks — `<p>text<br><br></p>` — is how a note ends up
 * with trailing blank space, and ProseMirror copies it faithfully: the clipboard slice is
 * open at both ends, so on paste those breaks merge straight into the paragraph at the
 * caret and show up as blank lines above and below the text that was actually copied.
 * Every round of copy and paste adds another one.
 *
 * A break at the edge of a block renders as empty space and is always padding. A break
 * *between* two runs of text is the author's line break and is left alone. The same pass
 * runs on the way out (`transformCopied`) and on the way in (`transformPasted`), so a
 * selection taken from a note that already carries the padding still copies clean.
 */

const mapChildren = (
	fragment: Fragment,
	transform: (node: ProseMirrorNode) => ProseMirrorNode
): Fragment => {
	const mapped: ProseMirrorNode[] = [];
	fragment.forEach((child) => mapped.push(transform(child)));
	return Fragment.fromArray(mapped);
};

/**
 * The same block without the line breaks on its edges, recursing through wrappers so a
 * paragraph inside a list item or a table cell is reached too.
 *
 * Code blocks are exempt: inside them a line break is a line of the source.
 */
const withoutEdgeBreaks = (node: ProseMirrorNode): ProseMirrorNode => {
	if (node.isText || node.isLeaf || node.type.spec.code) return node;
	if (!node.isTextblock) return node.copy(mapChildren(node.content, withoutEdgeBreaks));

	const children: ProseMirrorNode[] = [];
	node.content.forEach((child) => children.push(child));

	let start = 0;
	let end = children.length;
	const isBreak = (child: ProseMirrorNode): boolean => child.type.name === 'hardBreak';
	while (start < end && isBreak(children[start])) start += 1;
	while (end > start && isBreak(children[end - 1])) end -= 1;

	if (start === 0 && end === children.length) return node;
	return node.copy(Fragment.fromArray(children.slice(start, end)));
};

/**
 * A block with nothing left in it. Code blocks are excluded — an empty fenced block is
 * something the author wrote, and it is the one textblock whose emptiness is content.
 */
const isBlankBlock = (node: ProseMirrorNode): boolean =>
	node.isTextblock && !node.type.spec.code && node.content.size === 0;

/**
 * The open depth for a boundary whose blank block was just removed.
 *
 * An open boundary means "this continues the block it is pasted into". Removing a blank
 * block that was itself open hands that openness to the block behind it, so the text
 * still merges into the caret's paragraph instead of splitting it — and closes the
 * boundary when the block behind it could not have merged anyway.
 */
const depthBehind = (open: number, next: ProseMirrorNode | undefined): number =>
	open === 1 && next?.isTextblock ? 1 : 0;

/**
 * The line breaks on the edges of a run of inline content.
 *
 * The common paste is not a block at all: a browser copies a selection inside a paragraph
 * as bare `<span>`s and `<br>`s, which parse to a slice whose own children are inline. The
 * trailing breaks are then siblings of the text rather than content of a textblock, and
 * they merge into the paragraph at the caret as blank lines.
 */
const withoutEdgeBreakChildren = (fragment: Fragment): Fragment => {
	const children: ProseMirrorNode[] = [];
	fragment.forEach((child) => children.push(child));
	if (!children.length || !children[0].isInline) return fragment;

	let start = 0;
	let end = children.length;
	const isBreak = (child: ProseMirrorNode): boolean => child.type.name === 'hardBreak';
	while (start < end && isBreak(children[start])) start += 1;
	while (end > start && isBreak(children[end - 1])) end -= 1;

	if (start === 0 && end === children.length) return fragment;
	return Fragment.fromArray(children.slice(start, end));
};

/**
 * A slice that is exactly one paragraph, handed back as its inline content.
 *
 * A closed block splits the paragraph at the caret in two and lands as a block of its
 * own — which is why a copied paragraph arrived on a line by itself while a copied list
 * item, nested deep enough to still be open, merged. Once the padding is gone a paragraph
 * is text rather than a structure worth keeping, so it merges the way the text it came
 * from would. `markdownSlice` already applies this rule to pasted Markdown.
 *
 * Only for a slice that is already closed: an open one merges on its own. A heading or a
 * list keeps its block, or pasting one would dissolve it into the caret's paragraph.
 */
const asInlineContent = (slice: Slice): Slice => {
	if (slice.openStart !== 0 || slice.openEnd !== 0) return slice;
	if (slice.content.childCount !== 1) return slice;
	const only = slice.content.firstChild;
	if (!only || only.type.name !== 'paragraph' || only.content.size === 0) return slice;
	return new Slice(only.content, 0, 0);
};

/**
 * The slice without its clipboard padding: line breaks on the edges of the slice itself
 * and on the edges of any block inside it, and blocks left empty at the slice's edges. A
 * slice that is padding all the way through is returned unchanged — there is nothing
 * better to offer than what was copied.
 */
export const withoutClipboardPadding = (slice: Slice): Slice => {
	const trimmed = withoutEdgeBreakChildren(mapChildren(slice.content, withoutEdgeBreaks));

	const children: ProseMirrorNode[] = [];
	trimmed.forEach((child) => children.push(child));

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

	if (start >= end)
		return asInlineContent(
			trimmed.eq(slice.content) ? slice : new Slice(trimmed, openStart, openEnd)
		);
	if (start === 0 && end === children.length && trimmed.eq(slice.content))
		return asInlineContent(slice);
	return asInlineContent(
		new Slice(Fragment.fromArray(children.slice(start, end)), openStart, openEnd)
	);
};

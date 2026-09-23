/**
 * Which top-level blocks of two note documents differ, for a before/after review.
 *
 * The two-pane diff renders each document faithfully (same schema, same node
 * views) and lets the reader scan for change. What the panes must agree on is
 * *where* the change is, so this module produces, per side, the kind each
 * top-level block carries: `context` when the block is textually identical on
 * both sides, `removed` for a block that only exists in the base document, and
 * `added` for a block that only exists in the candidate document.
 *
 * Alignment is LCS, not index-aligned: an insertion mid-document must not flag
 * every block that follows it. Blocks are compared by a text-and-type signature
 * rather than structural JSON equality, for the same reason the editor's block
 * shimmer does — a client Tiptap document and a server conversion can represent
 * the same text with different attributes, and raw equality would then call
 * everything changed.
 *
 * Pure and isomorphic: the document shapes are plain JSON, so this runs on the
 * client and the server with no ProseMirror runtime dependency, and two calls
 * with the same documents always return the same classification.
 */

import { diffArrays } from 'diff';
import type { ProseMirrorDocument, ProseMirrorNode } from '$lib/models/notes';
import type { NoteDiff, NoteDiffCounts, DiffSideBlock } from '$lib/models/notes/note-diff';

/**
 * The attributes that carry a node's identity, in the order they are read.
 *
 * Atom blocks hold no text at all — a draw.io block *is* its `diagramId` and an
 * embedded todo *is* its `todoId` — so text alone signs every diagram in a note
 * identically, and swapping one diagram for another would read as no change in
 * the very view that exists to review changes. This stays a whitelist rather
 * than every attribute for the reason the module comment gives: a client
 * document and a server conversion disagree about incidental attributes, and
 * comparing those would call everything changed.
 */
const IDENTITY_ATTRIBUTES = ['diagramId', 'todoId', 'src'] as const;

const identityAttribute = (
	attrs: object,
	name: (typeof IDENTITY_ATTRIBUTES)[number]
): string | number | undefined => {
	if (name === 'diagramId' && 'diagramId' in attrs) {
		const value = attrs.diagramId;
		return typeof value === 'string' || typeof value === 'number' ? value : undefined;
	}
	if (name === 'todoId' && 'todoId' in attrs) {
		const value = attrs.todoId;
		return typeof value === 'string' || typeof value === 'number' ? value : undefined;
	}
	if (name === 'src' && 'src' in attrs) {
		const value = attrs.src;
		return typeof value === 'string' || typeof value === 'number' ? value : undefined;
	}
	return undefined;
};

const identity = (block: ProseMirrorNode): string => {
	let marker = '';
	for (const name of IDENTITY_ATTRIBUTES) {
		const value =
			'attrs' in block && block.attrs ? identityAttribute(block.attrs, name) : undefined;
		if (typeof value === 'string' || typeof value === 'number') marker += `\u0000${name}=${value}`;
	}
	return marker;
};

/** The block's text and node identities, descending into content so nested nodes count. */
const blockContent = (block: ProseMirrorNode): string => {
	if (block.type === 'text') return block.text;
	let content = identity(block);
	if (!('content' in block) || !block.content) return content;
	for (const child of block.content) content += blockContent(child);
	return content;
};

/** Everything an equality decision is allowed to look at. */
const signature = (block: ProseMirrorNode): string => `${block.type}:${blockContent(block)}`;

const sameBlock = (before: ProseMirrorNode, after: ProseMirrorNode): boolean =>
	signature(before) === signature(after);

/**
 * The document a diff should compare, with the note's title as its first block.
 *
 * The title is not part of the body, so diffing documents alone leaves a rename
 * invisible: two identical panes and a `0 added · 0 removed` summary, while the
 * reader is asked which version to keep. Folding it in as a heading makes a
 * title change read as a changed first line in every view that compares notes —
 * the history dialog and the conflict dialog have to agree about that.
 */
export const withTitleBlock = (
	document: ProseMirrorDocument,
	title: string
): ProseMirrorDocument => ({
	type: 'doc',
	content: [
		{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
		...(document.content ?? [])
	]
});

/**
 * The change between two documents as a per-side block classification.
 *
 * A replacement reads as `removed` on the base side and `added` on the
 * candidate side — the old block is struck through on the left while its
 * replacement is highlighted on the right. An insertion or deletion is
 * classified on exactly the side it exists on.
 */
export const diffNoteDocuments = (
	base: ProseMirrorDocument,
	candidate: ProseMirrorDocument
): NoteDiff => {
	const before = [...(base.content ?? [])];
	const after = [...(candidate.content ?? [])];
	const baseBlocks: DiffSideBlock[] = [];
	const candidateBlocks: DiffSideBlock[] = [];
	let baseIndex = 0;
	let candidateIndex = 0;
	for (const change of diffArrays(before, after, { comparator: sameBlock })) {
		if (change.removed) {
			for (const _block of change.value) {
				baseBlocks.push({ index: baseIndex, kind: 'removed' });
				baseIndex += 1;
			}
		} else if (change.added) {
			for (const _block of change.value) {
				candidateBlocks.push({ index: candidateIndex, kind: 'added' });
				candidateIndex += 1;
			}
		} else {
			for (const _block of change.value) {
				baseBlocks.push({ index: baseIndex, kind: 'context' });
				candidateBlocks.push({ index: candidateIndex, kind: 'context' });
				baseIndex += 1;
				candidateIndex += 1;
			}
		}
	}
	return { base: baseBlocks, candidate: candidateBlocks };
};

/** How much a diff actually changed, for a quiet summary caption. */
export const countNoteDiff = (diff: NoteDiff): NoteDiffCounts => {
	let added = 0;
	let removed = 0;
	for (const block of diff.candidate) if (block.kind === 'added') added += 1;
	for (const block of diff.base) if (block.kind === 'removed') removed += 1;
	return { added, removed };
};

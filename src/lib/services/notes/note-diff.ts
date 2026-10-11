import {
	INLINE_ATOM,
	DIFF_TEXTBLOCK_TYPES,
	type NoteComparison,
	type NoteComparisonOptions,
	type RenderedBlock,
	type FocusedDiffSide
} from '$lib/models/note-comparison';
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

import { diffArrays, diffLines, diffWordsWithSpace } from 'diff';
import type { ProseMirrorDocument, ProseMirrorNode } from '$lib/models/notes';
import type {
	NoteDiff,
	NoteDiffCounts,
	DiffSideBlock,
	FocusedSideBlock,
	InnerChange,
	RenderedAlignment,
	SourceLine
} from '$lib/models/note-comparison';

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
const IDENTITY_ATTRIBUTES = ['diagramId', 'todoId', 'src', 'widgetId', 'latex'] as const;

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
	// A widget is its `widgetId` and a formula its `latex`: neither carries text content,
	// so without these a swapped widget or an edited formula reads as no change.
	if (name === 'widgetId' && 'widgetId' in attrs) {
		const value = attrs.widgetId;
		return typeof value === 'string' || typeof value === 'number' ? value : undefined;
	}
	if (name === 'latex' && 'latex' in attrs) {
		const value = attrs.latex;
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
const withTitleBlock = (document: ProseMirrorDocument, title: string): ProseMirrorDocument => ({
	type: 'doc',
	content: [
		{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
		...(document.content ?? [])
	]
});

/** The node types whose content is inline, so a change inside them is a change of words. */
const TEXTBLOCK_TYPES = new Set(DIFF_TEXTBLOCK_TYPES);

/** Whether a node type is one the inner diff indexes as a textblock. */

/** Stands in for an inline node that is not text: one character, as it is one position. */

/** A textblock's text, with each inline non-text node counted as one character. */
const textblockText = (block: ProseMirrorNode): string => {
	if (!('content' in block) || !block.content) return '';
	let text = '';
	for (const child of block.content) text += child.type === 'text' ? child.text : INLINE_ATOM;
	return text;
};

/** The texts of every textblock inside `block`, in document order, the block itself included. */
const textblocks = (block: ProseMirrorNode): string[] => {
	if (TEXTBLOCK_TYPES.has(block.type)) return [textblockText(block)];
	if (!('content' in block) || !block.content) return [];
	return block.content.flatMap(textblocks);
};

/** The plain text of a block, for a diagram whose source is its text content. */
const sourceText = (block: ProseMirrorNode): string => {
	if (block.type === 'text') return block.text;
	if (!('content' in block) || !block.content) return '';
	return block.content.map(sourceText).join('');
};

interface InnerDiff {
	readonly base: readonly InnerChange[];
	readonly candidate: readonly InnerChange[];
	/** Whether any text survived on both sides — without it, the pair was rewritten. */
	readonly shared: boolean;
}

interface TextRange {
	readonly from: number;
	readonly to: number;
}

/**
 * Joins ranges that only whitespace separates. Word diffs split a rewritten phrase at every
 * space, and a phrase marked as six islands reads as six edits.
 */
const joinRanges = (ranges: readonly TextRange[], text: string): TextRange[] => {
	const joined: TextRange[] = [];
	for (const range of ranges) {
		const last = joined.at(-1);
		if (last && text.slice(last.to, range.from).trim() === '') {
			joined[joined.length - 1] = { from: last.from, to: range.to };
		} else {
			joined.push(range);
		}
	}
	return joined;
};

/**
 * Two versions of one textblock compared word by word. Whitespace is a token of its own,
 * so the parts rebuild each text exactly and their offsets are the editor's offsets.
 */
const diffWords = (
	before: string,
	after: string
): { base: TextRange[]; candidate: TextRange[]; shared: boolean } => {
	const base: TextRange[] = [];
	const candidate: TextRange[] = [];
	let shared = false;
	let beforeChar = 0;
	let afterChar = 0;
	for (const part of diffWordsWithSpace(before, after)) {
		const length = part.value.length;
		if (part.removed) {
			base.push({ from: beforeChar, to: beforeChar + length });
			beforeChar += length;
		} else if (part.added) {
			candidate.push({ from: afterChar, to: afterChar + length });
			afterChar += length;
		} else {
			shared ||= part.value.trim().length > 0;
			beforeChar += length;
			afterChar += length;
		}
	}
	return { base: joinRanges(base, before), candidate: joinRanges(candidate, after), shared };
};

/**
 * The changes between two blocks' textblocks: textblocks aligned by their text, a textblock
 * with no counterpart changed whole, and a replaced pair compared word by word.
 */
const diffTextblocks = (before: readonly string[], after: readonly string[]): InnerDiff => {
	const base: InnerChange[] = [];
	const candidate: InnerChange[] = [];
	let shared = false;
	let beforeIndex = 0;
	let afterIndex = 0;
	const changes = diffArrays([...before], [...after]);
	for (let position = 0; position < changes.length; position += 1) {
		const change = changes[position];
		if (!change.added && !change.removed) {
			shared ||= change.value.some((text) => text.trim().length > 0);
			beforeIndex += change.value.length;
			afterIndex += change.value.length;
			continue;
		}
		const next = changes[position + 1];
		const removed = change.removed ? change.value : [];
		const added = change.removed && next?.added ? next.value : change.added ? change.value : [];
		if (change.removed && next?.added) position += 1;
		const paired = Math.min(removed.length, added.length);
		for (let offset = 0; offset < paired; offset += 1) {
			const words = diffWords(removed[offset], added[offset]);
			shared ||= words.shared;
			for (const range of words.base) {
				base.push({ kind: 'text', textblock: beforeIndex + offset, ...range });
			}
			for (const range of words.candidate) {
				candidate.push({ kind: 'text', textblock: afterIndex + offset, ...range });
			}
		}
		for (let offset = paired; offset < removed.length; offset += 1) {
			base.push({ kind: 'textblock', textblock: beforeIndex + offset });
		}
		for (let offset = paired; offset < added.length; offset += 1) {
			candidate.push({ kind: 'textblock', textblock: afterIndex + offset });
		}
		beforeIndex += removed.length;
		afterIndex += added.length;
	}
	return { base, candidate, shared };
};

/** A diagram's source as a line diff, for the reader who cannot see a change in a picture. */
const diffSource = (before: string, after: string): SourceLine[] =>
	diffLines(before, after).flatMap((part) =>
		part.value
			.replace(/\n$/, '')
			.split('\n')
			.map((text) => ({
				kind: part.added
					? ('added' as const)
					: part.removed
						? ('removed' as const)
						: ('context' as const),
				text
			}))
	);

type PairedKinds =
	| { readonly kind: 'paired'; readonly base: DiffSideBlock; readonly candidate: DiffSideBlock }
	| { readonly kind: 'unpaired' };

/**
 * How a replaced block reads against its replacement, when the two are versions of one
 * block rather than two different blocks: the same type, the same identity, and some text
 * in common. Anything else is a block removed and a block added.
 */
const pairBlocks = (
	before: ProseMirrorNode,
	after: ProseMirrorNode,
	baseIndex: number,
	candidateIndex: number
): PairedKinds => {
	if (before.type !== after.type || identity(before) !== identity(after)) {
		return { kind: 'unpaired' };
	}
	if (before.type === 'mermaid') {
		return {
			kind: 'paired',
			base: { index: baseIndex, kind: 'removed' },
			candidate: {
				index: candidateIndex,
				kind: 'diagram-edited',
				lines: diffSource(sourceText(before), sourceText(after))
			}
		};
	}
	const inner = diffTextblocks(textblocks(before), textblocks(after));
	if (!inner.shared || (inner.base.length === 0 && inner.candidate.length === 0)) {
		return { kind: 'unpaired' };
	}
	return {
		kind: 'paired',
		base: { index: baseIndex, kind: 'edited', tone: 'removed', changes: inner.base },
		candidate: { index: candidateIndex, kind: 'edited', tone: 'added', changes: inner.candidate }
	};
};

/**
 * The change between two documents as a per-side block classification.
 *
 * A block that exists on one side only reads as `removed` or `added` there. A run of
 * removed blocks directly followed by a run of added ones is a replacement, and its blocks
 * are paired by position: a pair that is two versions of one block reads as `edited`, with
 * the changed words, cells or list items inside it, and an edited diagram carries its source
 * line diff. A pair that is not reads as one block removed and another added.
 */
const diffNoteDocuments = (base: ProseMirrorDocument, candidate: ProseMirrorDocument): NoteDiff => {
	const before = [...(base.content ?? [])];
	const after = [...(candidate.content ?? [])];
	const baseBlocks: DiffSideBlock[] = [];
	const candidateBlocks: DiffSideBlock[] = [];
	let baseIndex = 0;
	let candidateIndex = 0;
	const changes = diffArrays(before, after, { comparator: sameBlock });
	for (let position = 0; position < changes.length; position += 1) {
		const change = changes[position];
		if (!change.added && !change.removed) {
			for (const _block of change.value) {
				baseBlocks.push({ index: baseIndex, kind: 'context' });
				candidateBlocks.push({ index: candidateIndex, kind: 'context' });
				baseIndex += 1;
				candidateIndex += 1;
			}
			continue;
		}
		const next = changes[position + 1];
		const removed = change.removed ? change.value : [];
		const added = change.removed && next?.added ? next.value : change.added ? change.value : [];
		if (change.removed && next?.added) position += 1;
		const removedKinds: DiffSideBlock[] = removed.map((_block, offset) => ({
			index: baseIndex + offset,
			kind: 'removed'
		}));
		const addedKinds: DiffSideBlock[] = added.map((_block, offset) => ({
			index: candidateIndex + offset,
			kind: 'added'
		}));
		for (let offset = 0; offset < Math.min(removed.length, added.length); offset += 1) {
			const pair = pairBlocks(
				removed[offset],
				added[offset],
				baseIndex + offset,
				candidateIndex + offset
			);
			if (pair.kind === 'unpaired') continue;
			removedKinds[offset] = pair.base;
			addedKinds[offset] = pair.candidate;
		}
		baseBlocks.push(...removedKinds);
		candidateBlocks.push(...addedKinds);
		baseIndex += removed.length;
		candidateIndex += added.length;
	}
	return { base: baseBlocks, candidate: candidateBlocks };
};

/** How much a diff actually changed, for a quiet summary caption. */
const countNoteDiff = (diff: NoteDiff): NoteDiffCounts => {
	let added = 0;
	let removed = 0;
	for (const block of diff.candidate) if (block.kind !== 'context') added += 1;
	for (const block of diff.base) if (block.kind !== 'context') removed += 1;
	return { added, removed };
};

const isEmptyParagraph = (block: ProseMirrorNode): boolean =>
	block.type === 'paragraph' && (!('content' in block) || !block.content?.length);

/** One rendered top-level block, as much of it as alignment needs. */

/**
 * Which stored block each rendered top-level block shows.
 *
 * The editor normalises on load: it inserts an empty paragraph between a heading and a
 * diagram, and another after a document that ends in anything but a paragraph. Painting
 * by raw index then marks the wrong blocks, and refusing to paint on a count mismatch left
 * a whole side with no marks at all. An empty rendered paragraph the stored document does
 * not have at that point is a spacer; every other rendered block must be the next stored
 * block, of the same type, or the rendering is not one this function can account for.
 */
const alignRenderedBlocks = (
	stored: readonly ProseMirrorNode[],
	rendered: readonly RenderedBlock[]
): RenderedAlignment => {
	const storedIndex: (number | null)[] = [];
	let cursor = 0;
	for (const block of rendered) {
		const next = stored[cursor];
		const sameType =
			next !== undefined &&
			(next.type === block.type || (next.type === 'unknown' && block.type === 'codeBlock'));
		if (sameType && !(block.empty && !isEmptyParagraph(next))) {
			storedIndex.push(cursor);
			cursor += 1;
		} else if (block.empty && block.type === 'paragraph') {
			storedIndex.push(null);
		} else {
			return { kind: 'failure' };
		}
	}
	return cursor === stored.length ? { kind: 'aligned', storedIndex } : { kind: 'failure' };
};

/** One side of a diff trimmed to its changes; `kinds` is index-aligned with `document`. */

/** The paragraph that stands in for a folded run of unchanged blocks. */
const elidedMarker = (count: number): ProseMirrorNode => ({
	type: 'paragraph',
	content: [{ type: 'text', text: `${count} unchanged ${count === 1 ? 'block' : 'blocks'}` }]
});

/**
 * One side of a diff with its unchanged stretches folded away, for a preview that has
 * room only for the change.
 *
 * Every changed block stays, with up to `context` unchanged neighbours either side so
 * the change still reads in place; each run of unchanged blocks beyond that becomes one
 * `elided` marker saying how many it hides. A side with no change of its own — the base
 * side of a pure insertion — folds to a single marker: the other side carries the change,
 * and the whole note repeated above it is exactly what the fold exists to remove.
 *
 * The returned `kinds` is index-aligned with the returned document, because the pane
 * paints by index and refuses to paint a document whose block count disagrees.
 */
const focusNoteDiffSide = (
	document: ProseMirrorDocument,
	kinds: readonly DiffSideBlock[],
	context = 1
): FocusedDiffSide => {
	const blocks = document.content ?? [];
	if (kinds.length !== blocks.length) {
		throw new Error(
			`Cannot focus a diff side: ${kinds.length} classifications for ${blocks.length} blocks`
		);
	}
	const kept = kinds.map(() => false);
	kinds.forEach((block, index) => {
		if (block.kind === 'context') return;
		const from = Math.max(0, index - context);
		const to = Math.min(kinds.length - 1, index + context);
		for (let near = from; near <= to; near += 1) kept[near] = true;
	});
	const content: ProseMirrorNode[] = [];
	const focused: FocusedSideBlock[] = [];
	let folded = 0;
	const fold = () => {
		if (folded === 0) return;
		focused.push({ index: content.length, kind: 'elided' });
		content.push(elidedMarker(folded));
		folded = 0;
	};
	blocks.forEach((block, index) => {
		if (!kept[index]) {
			folded += 1;
			return;
		}
		fold();
		focused.push({ ...kinds[index], index: content.length });
		content.push(block);
	});
	fold();
	return { document: { ...document, content }, kinds: focused };
};

export interface NoteComparisonRules {
	compare(
		base: ProseMirrorDocument,
		candidate: ProseMirrorDocument,
		options: NoteComparisonOptions
	): NoteComparison;
	align(stored: readonly ProseMirrorNode[], rendered: readonly RenderedBlock[]): RenderedAlignment;
	textblocks(block: ProseMirrorNode): readonly string[];
}
export class NoteComparisonService implements NoteComparisonRules {
	compare(
		base: ProseMirrorDocument,
		candidate: ProseMirrorDocument,
		options: NoteComparisonOptions
	): NoteComparison {
		const before = options.titles ? withTitleBlock(base, options.titles.base) : base;
		const after = options.titles ? withTitleBlock(candidate, options.titles.candidate) : candidate;
		const diff = diffNoteDocuments(before, after);
		return {
			base: options.focus
				? focusNoteDiffSide(before, diff.base)
				: { document: before, kinds: diff.base },
			candidate: options.focus
				? focusNoteDiffSide(after, diff.candidate)
				: { document: after, kinds: diff.candidate },
			counts: countNoteDiff(diff)
		};
	}
	align(stored: readonly ProseMirrorNode[], rendered: readonly RenderedBlock[]): RenderedAlignment {
		return alignRenderedBlocks(stored, rendered);
	}
	textblocks(block: ProseMirrorNode): readonly string[] {
		return textblocks(block);
	}
}

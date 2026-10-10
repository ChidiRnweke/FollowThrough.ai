/**
 * Paints a diff side's classification onto the editor document that renders it.
 *
 * The classification indexes the stored document; the editor renders a normalised one
 * (spacer paragraphs between headings and diagrams, a trailing paragraph). Alignment maps
 * one onto the other first, and a rendering it cannot account for is reported as a
 * failure for the pane to state — painting by raw index marks the wrong blocks, and
 * painting nothing hides the change the pane exists to show.
 */

import type { Node as ProseMirrorEditorNode } from '@tiptap/pm/model';
import { Decoration } from '@tiptap/pm/view';
import type { ProseMirrorNode } from '$lib/models/notes';
import type {
	DiffTone,
	FocusedSideBlock,
	InnerChange,
	SourceLine
} from '$lib/models/notes/note-diff';
import {
	INLINE_ATOM,
	alignRenderedBlocks,
	isDiffTextblock,
	textblocks
} from '$lib/services/notes/note-diff';

export type DiffPaint =
	| { readonly kind: 'painted'; readonly decorations: readonly Decoration[] }
	| { readonly kind: 'failure' };

export interface DiffPaintInput {
	readonly doc: ProseMirrorEditorNode;
	readonly stored: readonly ProseMirrorNode[];
	readonly kinds: readonly FocusedSideBlock[];
	/** Node types the editor draws through a node view, whose own fills hide a plain wash. */
	readonly nodeViews: ReadonlySet<string>;
	/** Builds the source-changes disclosure under an edited diagram. */
	readonly sourceWidget: (lines: readonly SourceLine[], key: string) => HTMLElement;
	readonly destroyWidget: (element: HTMLElement) => void;
}

/** A block drawn by a node view, or a table, takes the wash as an overlay on top. */
const blockClass = (node: ProseMirrorEditorNode, tone: string, nodeViews: ReadonlySet<string>) =>
	nodeViews.has(node.type.name) || node.type.name === 'table'
		? `diff-block diff-${tone} diff-overlay`
		: `diff-block diff-${tone}`;

/** The rendered textblock's text, counted the way the classification counted it. */
const renderedText = (node: ProseMirrorEditorNode): string => {
	let text = '';
	node.forEach((child) => {
		text += child.isText ? (child.text ?? '') : INLINE_ATOM;
	});
	return text;
};

interface RenderedTextblock {
	readonly node: ProseMirrorEditorNode;
	readonly pos: number;
}

const renderedTextblocks = (block: ProseMirrorEditorNode, offset: number): RenderedTextblock[] => {
	if (isDiffTextblock(block.type.name)) return [{ node: block, pos: offset }];
	const found: RenderedTextblock[] = [];
	block.descendants((node, pos) => {
		if (!isDiffTextblock(node.type.name)) return true;
		found.push({ node, pos: offset + 1 + pos });
		return false;
	});
	return found;
};

/** The table cell holding `pos`, so a cell change marks the cell rather than its paragraph. */
const enclosingCell = (
	doc: ProseMirrorEditorNode,
	pos: number
): { node: ProseMirrorEditorNode; pos: number } | undefined => {
	const resolved = doc.resolve(pos);
	for (let depth = resolved.depth; depth > 0; depth -= 1) {
		const node = resolved.node(depth);
		if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
			return { node, pos: resolved.before(depth) };
		}
	}
	return undefined;
};

/**
 * The marks inside an edited block: changed words as inline washes, a changed textblock
 * as a block wash, and the table cell around either tinted so a reader scanning a wide
 * table finds the cell before reading it. Undefined when the rendered block's textblocks
 * are not the stored ones, so the caller washes the whole block instead of guessing.
 */
const innerDecorations = (
	doc: ProseMirrorEditorNode,
	block: ProseMirrorEditorNode,
	offset: number,
	stored: ProseMirrorNode,
	tone: DiffTone,
	changes: readonly InnerChange[]
): Decoration[] | undefined => {
	const expected = textblocks(stored);
	const rendered = renderedTextblocks(block, offset);
	if (
		rendered.length !== expected.length ||
		rendered.some((textblock, index) => renderedText(textblock.node) !== expected[index])
	) {
		return undefined;
	}
	const decorations: Decoration[] = [];
	const cells = new Set<number>();
	for (const change of changes) {
		const textblock = rendered[change.textblock];
		const cell = enclosingCell(doc, textblock.pos + 1);
		if (cell && !cells.has(cell.pos)) {
			cells.add(cell.pos);
			decorations.push(
				Decoration.node(cell.pos, cell.pos + cell.node.nodeSize, {
					class: `diff-cell diff-cell-${tone}`
				})
			);
		}
		if (change.kind === 'text') {
			const start = textblock.pos + 1;
			decorations.push(
				Decoration.inline(start + change.from, start + change.to, {
					class: `diff-text diff-text-${tone}`
				})
			);
		} else if (!cell) {
			decorations.push(
				Decoration.node(textblock.pos, textblock.pos + textblock.node.nodeSize, {
					class: `diff-block diff-${tone}`
				})
			);
		}
	}
	return decorations;
};

export const paintDiff = (input: DiffPaintInput): DiffPaint => {
	const { doc, stored, kinds, nodeViews } = input;
	const rendered: { type: string; empty: boolean }[] = [];
	doc.forEach((node) => {
		rendered.push({
			type: node.type.name,
			empty: node.type.name === 'paragraph' && node.childCount === 0
		});
	});
	const alignment = alignRenderedBlocks(stored, rendered);
	if (alignment.kind === 'failure') return { kind: 'failure' };
	const decorations: Decoration[] = [];
	doc.forEach((node, offset, index) => {
		const storedIndex = alignment.storedIndex[index];
		// A spacer the editor inserted is not in the note, and in a 160px preview it cost a
		// diagram its place on screen; the pane hides it.
		if (storedIndex === null) {
			decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'diff-spacer' }));
			return;
		}
		const block = kinds[storedIndex];
		const end = offset + node.nodeSize;
		switch (block.kind) {
			case 'context':
				return;
			case 'removed':
			case 'added':
			case 'elided':
				decorations.push(
					Decoration.node(offset, end, { class: blockClass(node, block.kind, nodeViews) })
				);
				return;
			case 'edited': {
				const inner = innerDecorations(
					doc,
					node,
					offset,
					stored[storedIndex],
					block.tone,
					block.changes
				);
				decorations.push(
					...(inner ?? [
						Decoration.node(offset, end, { class: blockClass(node, block.tone, nodeViews) })
					])
				);
				return;
			}
			case 'diagram-edited': {
				// Keyed by content too: a reused key keeps the old lines on screen.
				const key = `diagram-source-${storedIndex}:${block.lines.map((line) => `${line.kind}:${line.text}`).join('\n')}`;
				decorations.push(
					Decoration.node(offset, end, { class: blockClass(node, 'added', nodeViews) }),
					Decoration.widget(end, () => input.sourceWidget(block.lines, key), {
						side: 1,
						key,
						ignoreSelection: true,
						destroy: (element) => {
							if (element instanceof HTMLElement) input.destroyWidget(element);
						}
					})
				);
				return;
			}
		}
	});
	return { kind: 'painted', decorations };
};

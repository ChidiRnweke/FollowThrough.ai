import type { ProseMirrorDocument } from '$lib/models/notes';
/** Which side of a comparison a change belongs to, and so which wash it takes. */
export type DiffTone = 'removed' | 'added';

/**
 * One change inside a block that was edited rather than replaced.
 *
 * `textblock` is the index, in document order, of a textblock (paragraph, heading or code
 * block) inside the block — a table cell's paragraph counts like any other. `text` changes
 * carry character offsets into that textblock's text, where every inline node that is not
 * text counts as one character, as it occupies one position in the editor.
 */
export type InnerChange =
	| { readonly kind: 'textblock'; readonly textblock: number }
	| {
			readonly kind: 'text';
			readonly textblock: number;
			readonly from: number;
			readonly to: number;
	  };

/** One line of a diagram's source, as the line diff of an edited diagram states it. */
export interface SourceLine {
	readonly kind: 'context' | DiffTone;
	readonly text: string;
}

/**
 * The classification of one top-level block, by its index in its own document.
 *
 * `removed` and `added` mark a whole block that exists on one side only. `edited` marks a
 * block paired with its counterpart on the other side, carrying the changes inside it so
 * the reader sees the words or cells that moved rather than a washed paragraph or table.
 * `diagram-edited` is the candidate side of an edited diagram: a picture cannot show which
 * line of its source changed, so the line diff travels with it.
 */
export type DiffSideBlock =
	| { readonly index: number; readonly kind: 'context' }
	| { readonly index: number; readonly kind: DiffTone }
	| {
			readonly index: number;
			readonly kind: 'edited';
			readonly tone: DiffTone;
			readonly changes: readonly InnerChange[];
	  }
	| {
			readonly index: number;
			readonly kind: 'diagram-edited';
			readonly lines: readonly SourceLine[];
	  };

export interface NoteDiff {
	/** Classification of the base document's top-level blocks, in order. */
	readonly base: readonly DiffSideBlock[];
	/** Classification of the candidate document's top-level blocks, in order. */
	readonly candidate: readonly DiffSideBlock[];
}

export interface NoteDiffCounts {
	readonly added: number;
	readonly removed: number;
}

/**
 * The classification of one top-level block of a focused side, by its index there: a diff
 * classification, or the `elided` marker that stands in for a run of unchanged blocks
 * folded out of the side.
 */
export type FocusedSideBlock = DiffSideBlock | { readonly index: number; readonly kind: 'elided' };

/**
 * Where each rendered top-level block came from in the stored document. The editor may
 * insert empty spacer paragraphs (between a heading and a diagram, after a trailing
 * non-paragraph block); those map to `null`. A rendered document the walk cannot account
 * for is a failure, which the pane must say rather than paint nothing.
 */
export type RenderedAlignment =
	| { readonly kind: 'aligned'; readonly storedIndex: readonly (number | null)[] }
	| { readonly kind: 'failure' };

export interface RenderedBlock {
	readonly type: string;
	readonly empty: boolean;
}

export interface FocusedDiffSide {
	readonly document: ProseMirrorDocument;
	readonly kinds: readonly FocusedSideBlock[];
}

export interface NoteComparisonOptions {
	readonly focus: boolean;
	readonly titles?: { readonly base: string; readonly candidate: string };
}
export interface NoteComparison {
	readonly base: FocusedDiffSide;
	readonly candidate: FocusedDiffSide;
	readonly counts: NoteDiffCounts;
}
/** Inline atoms occupy one editor position. */
export const INLINE_ATOM = '\uFFFC';
export const DIFF_TEXTBLOCK_TYPES: readonly string[] = ['paragraph', 'heading', 'codeBlock'];

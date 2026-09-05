/**
 * Which blocks of a note "re-render" when an external revision replaces the
 * document.
 *
 * The reconciliation path only shimmers the top-level blocks that actually
 * changed, so the interface reads as briefly re-rendering the changed area
 * rather than celebrating the action — unchanged blocks stay perfectly still.
 *
 * Blocks are compared by a text-and-type signature rather than structural
 * JSON equality on purpose: a client Tiptap document and the server's
 * markdown-to-ProseMirror conversion can represent the same text with
 * different attributes or marks, and raw equality would then shimmer every
 * block on every sync. Text equality is robust to that noise. The miss is a
 * block whose formatting changed but whose text did not — which the agent's
 * text-anchored tools (`save_note`, `edit_note`) cannot produce anyway.
 *
 * Comparison is index-aligned, so an insertion or deletion mid-document also
 * marks the blocks that follow it. The change region re-renders as one — the
 * intended metaphor — rather than a precise diff hunk.
 *
 * Pure and isomorphic: the document shapes are plain JSON, so this runs on
 * the client only, with no ProseMirror runtime dependency.
 */

/**
 * The part of a document block this comparison reads, and nothing else.
 *
 * Structurally a `ProseMirrorNode` satisfies it, which is what the caller
 * passes; it cannot say so by name, because a model file may not import its
 * domain's barrel. Every field this once declared as `unknown` was read through
 * a `typeof` immediately below, and `attrs` was never read at all — the shape
 * was already known, it just was not written down.
 */
export interface ShimmerNode {
	readonly type?: string;
	readonly text?: string;
	readonly content?: readonly ShimmerNode[];
}

export interface ShimmerDocument {
	readonly type: 'doc';
	readonly content?: readonly ShimmerNode[];
}

/** The block's full text, descending into content so nested nodes count. */
const blockText = (block: ShimmerNode | undefined): string => {
	if (!block) return '';
	if (block.text !== undefined) return block.text;
	let text = '';
	for (const child of block.content ?? []) text += blockText(child);
	return text;
};

/** Everything a changed-block decision is allowed to look at. */
const signature = (block: ShimmerNode | undefined): string =>
	`${block?.type ?? ''}:${blockText(block)}`;

/**
 * Indices into `next` of the top-level blocks that differ from the block at
 * the same position in `previous`. Blocks beyond the old length count as new.
 */
export const changedTopLevelBlockIndices = (
	previous: ShimmerDocument,
	next: ShimmerDocument
): number[] => {
	const before = previous.content ?? [];
	const after = next.content ?? [];
	const changed: number[] = [];
	for (let index = 0; index < after.length; index += 1) {
		if (signature(before[index]) !== signature(after[index])) changed.push(index);
	}
	return changed;
};

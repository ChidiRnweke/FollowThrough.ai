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

export interface ShimmerNode {
	readonly type?: unknown;
	readonly text?: unknown;
	readonly attrs?: unknown;
	readonly content?: readonly unknown[];
}

export interface ShimmerDocument {
	readonly type: 'doc';
	readonly content?: readonly ShimmerNode[];
}

/** The block's full text, descending into content so nested nodes count. */
const blockText = (block: ShimmerNode | undefined): string => {
	if (!block) return '';
	if (typeof block.text === 'string') return block.text;
	if (!block.content) return '';
	let text = '';
	for (const child of block.content) {
		if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
			text += blockText(child as ShimmerNode);
		}
	}
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

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

import type { ProseMirrorDocument, ProseMirrorNode } from '$lib/models/notes';

/** The block's full text, descending into content so nested nodes count. */
const blockText = (block: ProseMirrorNode): string => {
	if (block.type === 'text') return block.text;
	let text = '';
	for (const child of 'content' in block ? (block.content ?? []) : []) text += blockText(child);
	return text;
};

/** Everything a changed-block decision is allowed to look at. */
const signature = (block: ProseMirrorNode): string => `${block.type}:${blockText(block)}`;

/**
 * Indices into `next` of the top-level blocks that differ from the block at
 * the same position in `previous`. Blocks beyond the old length count as new.
 */
export const changedTopLevelBlockIndices = (
	previous: ProseMirrorDocument,
	next: ProseMirrorDocument
): number[] => {
	const before = previous.content ?? [];
	const after = next.content ?? [];
	const changed: number[] = [];
	for (const [index, block] of after.entries()) {
		const previousBlock = before[index];
		if (!previousBlock || signature(previousBlock) !== signature(block)) changed.push(index);
	}
	return changed;
};

import type { ProseMirrorDocument, ProseMirrorUnknownNode } from '$lib/models/notes';
/** Corpus assertions inspect the actual boundary result, without a production-only test export. */
export const unreadableDocumentBlocks = (
	document: ProseMirrorDocument
): readonly ProseMirrorUnknownNode[] =>
	(document.content ?? []).filter((node) => node.type === 'unknown');

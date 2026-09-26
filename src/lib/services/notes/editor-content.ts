import type { ProseMirrorDocument, ProseMirrorNode } from '$lib/models/notes';

/**
 * A document safe to hand to the editor.
 *
 * `ProseMirrorUnknownNode` is a storage concept: it exists so a list read cannot
 * throw. Tiptap has no such node type, and handing it one produces exactly the
 * failure the arm was added to prevent, one layer further out. So the seam into
 * the editor converts it, and converts it into something *visible and
 * preserved* — a code block holding the block's own JSON — rather than dropping
 * it. If the note is then saved, the user still has their content on screen and
 * in the document, as text they can see and copy, instead of a block that
 * vanished silently.
 *
 * In practice this should never fire: the corpus conformance spec fails if any
 * stored document contains an unknown node. It is here for the case that spec is
 * written to catch, in the window before someone fixes it.
 */
export const editableProseMirrorDocument = (document: ProseMirrorDocument): ProseMirrorDocument => {
	const convert = (node: ProseMirrorNode): ProseMirrorNode => {
		if (node.type === 'unknown')
			return {
				type: 'codeBlock',
				attrs: { language: 'json' },
				content: [{ type: 'text', text: JSON.stringify(node.raw, null, '\t') }]
			};
		if (!('content' in node) || !node.content) return node;
		return { ...node, content: node.content.map(convert) };
	};
	return { ...document, content: document.content?.map(convert) };
};

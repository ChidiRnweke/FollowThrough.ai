import { generateText, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { noteMarkdownExtensions } from './markdown-extensions.js';
import { editorContent, parseEdraDocument, type EdraDocument } from './document.js';

/**
 * Markdown ↔ note conversion.
 *
 * Isomorphic on purpose: the agent's `edit_note` tool applies a patch on the server, and
 * the approval card previews the same patch in the browser before the user accepts it.
 * If the two sides converted differently, the preview would be a plausible lie.
 */

const extensions = noteMarkdownExtensions;

const markdown = new MarkdownManager({ extensions });

export interface NoteMarkdownContent {
	readonly document: EdraDocument;
	readonly plainText: string;
}

interface SerializableDocumentNode {
	readonly type: string;
	readonly text?: string;
	readonly content?: readonly SerializableDocumentNode[];
}

interface SerializableDocument {
	readonly type: 'doc';
	readonly content?: readonly SerializableDocumentNode[];
}

/**
 * Give a node the shape ProseMirror itself serializes: no `content` or `marks` key when
 * there are none.
 *
 * The Markdown parser writes both keys onto nodes that have none, holding `undefined` or
 * `[]`. The note schema is strict, and it declares leaf nodes without `content`. So every
 * rule, audio and iframe node in agent Markdown failed the write parse.
 */
const canonicalNode = ({ content, marks, ...node }: JSONContent): JSONContent => ({
	...node,
	...(marks === undefined || marks.length === 0 ? {} : { marks }),
	...(content === undefined || content.length === 0 ? {} : { content: content.map(canonicalNode) })
});

/** Convert a compact Markdown payload into the editor's persisted note content. */
export const noteContentFromMarkdown = (source: string): NoteMarkdownContent => {
	const parsed = markdown.parse(source);
	// The root keeps its `content`: an empty note is stored as `{ type: 'doc', content: [] }`.
	const document = parseEdraDocument({
		...parsed,
		content: (parsed.content ?? []).map(canonicalNode)
	});
	return {
		document,
		plainText: generateText(parsed, extensions, { blockSeparator: '\n\n' })
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	};
};

/**
 * Render a persisted note back to Markdown.
 *
 * The inverse of {@link noteContentFromMarkdown}, and the text a targeted edit anchors
 * against — so it has to round-trip every node the editor can produce, not just the ones
 * Markdown has native syntax for.
 */
export const noteMarkdownFromContent = (document: SerializableDocument): string =>
	markdown.serialize(editorContent(parseEdraDocument(document)));

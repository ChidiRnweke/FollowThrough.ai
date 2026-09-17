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
 * Drop a `content` key that carries no children, everywhere in the tree.
 *
 * The Markdown parser attaches `content` to every block it builds, including the ones
 * ProseMirror defines as childless, and for those it attaches the key holding
 * `undefined`. A key present holding `undefined` is not an absent key: `.strict()` reads
 * it as one more field it did not expect. So the note schema, which declares a rule as
 * `{ type: 'horizontalRule' }` and nothing else, rejected every body containing `---`.
 * In production the agent retried the same save six times in five minutes against a
 * schema error no argument of its own could fix.
 *
 * Applied to the parser's output before it is parsed, so the document that leaves this
 * module is already the shape the note schema describes. The document root keeps its own
 * `content`: an empty note is a state the product has, and `{ type: 'doc', content: [] }`
 * is how it is stored.
 */
const withoutEmptyContent = (value: JSONContent): JSONContent => {
	const { content, ...rest } = value;
	const children = content?.map(withoutEmptyContent);
	return children === undefined || children.length === 0 ? rest : { ...rest, content: children };
};

/** Convert a compact Markdown payload into the editor's persisted note content. */
export const noteContentFromMarkdown = (source: string): NoteMarkdownContent => {
	const parsed = markdown.parse(source);
	const document = parseEdraDocument({
		...withoutEmptyContent(parsed),
		content: (parsed.content ?? []).map(withoutEmptyContent)
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

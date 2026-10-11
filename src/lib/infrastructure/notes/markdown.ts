import { generateText, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import type { NoteMarkdown } from '$lib/models/note-markdown';
import {
	editorContent,
	parseEdraDocument,
	type EdraDocument
} from '$lib/infrastructure/notes/editor-document';
import { proseMirrorDocumentSchema, type ProseMirrorDocument } from '$lib/models/notes';
import { noteDocumentExtensions } from './schema/extensions';

/**
 * Markdown ↔ note conversion.
 *
 * Accepted workaround: this codec and the note schema in `./schema` are a vendored editor
 * dependency, not an application layer. The Tiptap schema is a set of module-level
 * definitions that the editor, controllers and the agent-files service all share, which the
 * service rules (no retained state, no service-to-service calls) cannot express. It lives in
 * infrastructure deliberately, outside the architecture checks; keep it a pure format library
 * with no application decisions.
 *
 * Isomorphic on purpose: the agent's `edit_note` tool applies a patch on the server, and
 * the approval card previews the same patch in the browser before the user accepts it.
 * If the two sides converted differently, the preview would be a plausible lie.
 */

/** The editor's view of Markdown: loose editor JSON for pasting, and a selection to copy. */
export interface EditorMarkdown {
	editorDocument(source: string): EdraDocument;
	markdown(document: EdraDocument): string;
}

const markdown = new MarkdownManager({ extensions: noteDocumentExtensions });

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

// The root keeps its `content`: an empty note is stored as `{ type: 'doc', content: [] }`.
const canonicalDocument = (parsed: JSONContent): EdraDocument =>
	parseEdraDocument({ ...parsed, content: (parsed.content ?? []).map(canonicalNode) });

const serialize = (document: SerializableDocument): string =>
	markdown.serialize(editorContent(parseEdraDocument(document)));

/** The note Markdown codec, shared by the editor, controllers and the agent-files service. */
export class NoteMarkdownCodec implements NoteMarkdown, EditorMarkdown {
	/** Converts a compact Markdown payload into a stored note document and its plain text. */
	read(source: string): { readonly document: ProseMirrorDocument; readonly plainText: string } {
		const parsed = markdown.parse(source);
		return {
			document: proseMirrorDocumentSchema.parse(canonicalDocument(parsed)),
			plainText: generateText(parsed, noteDocumentExtensions, { blockSeparator: '\n\n' })
				.replace(/\n{3,}/g, '\n\n')
				.trim()
		};
	}

	/**
	 * Renders a stored note back to Markdown.
	 *
	 * The inverse of {@link read}, and the text a targeted edit anchors against — so it has
	 * to round-trip every node the editor can produce, not just the ones Markdown has native
	 * syntax for.
	 */
	write(document: ProseMirrorDocument): string {
		return serialize(document);
	}

	editorDocument(source: string): EdraDocument {
		return canonicalDocument(markdown.parse(source));
	}

	markdown(document: SerializableDocument): string {
		return serialize(document);
	}
}

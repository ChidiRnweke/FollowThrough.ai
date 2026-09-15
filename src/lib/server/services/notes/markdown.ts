// chisel-ignore-file import-boundary:banned-layer-import -- Server preparation must use the editor-schema converter to preserve rich note content.
/**
 * Conversion lives with the editor schema it depends on. Server preparation uses this
 * adapter to produce the document that review displays and conditional save applies.
 */
import {
	noteContentFromMarkdown as editorContentFromMarkdown,
	noteMarkdownFromContent
} from '$lib/components/edra/commands/note-markdown';
import { parseProseMirrorDocument, type ProseMirrorDocument } from '$lib/models/notes';

export interface NoteMarkdownContent {
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
}

export const noteContentFromMarkdown = (source: string): NoteMarkdownContent => {
	const content = editorContentFromMarkdown(source);
	return { ...content, document: parseProseMirrorDocument(content.document) };
};

export { noteMarkdownFromContent };

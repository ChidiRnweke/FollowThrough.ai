// chisel-ignore-file import-boundary:banned-layer-import -- The document boundary shares the editor-schema converter so browser and server preserve the same rich note nodes.
import {
	noteContentFromMarkdown as editorContentFromMarkdown,
	noteMarkdownFromContent
} from '$lib/components/edra/commands/note-markdown';
import type { NoteMarkdown } from '$lib/models/note-markdown';
import { proseMirrorDocumentSchema, type ProseMirrorDocument } from '$lib/models/notes';
/** Decode external Markdown and encode persisted notes with the application's editor schema. */
export class NodeNoteMarkdown implements NoteMarkdown {
	read(source: string): { readonly document: ProseMirrorDocument; readonly plainText: string } {
		const content = editorContentFromMarkdown(source);
		return { ...content, document: proseMirrorDocumentSchema.parse(content.document) };
	}
	write(document: ProseMirrorDocument): string {
		return noteMarkdownFromContent(document);
	}
}

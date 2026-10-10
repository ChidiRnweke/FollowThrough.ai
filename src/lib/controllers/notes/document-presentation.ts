import type { JSONContent } from '@tiptap/core';
import type {
	ProseMirrorDocument,
	OutlineSource,
	OutlineHeading,
	OutlineOffset
} from '$lib/models/notes';
import type { NoteDocumentPresentation } from '$lib/services/notes/document-presentation';

export interface EditorDocumentCopy {
	copy(document: ProseMirrorDocument): JSONContent;
}
export interface NoteDocumentsController {
	editorContent(document: ProseMirrorDocument): JSONContent;
	changedBlocks(previous: ProseMirrorDocument, next: ProseMirrorDocument): readonly number[];
	outline(items: readonly OutlineSource[]): readonly OutlineHeading[];
	activeHeading(offsets: readonly OutlineOffset[], line: number): string | undefined;
}
/** Prepare the document and reading aids a note editor displays. */
export class NoteDocuments implements NoteDocumentsController {
	constructor(
		private readonly presentation: NoteDocumentPresentation,
		private readonly documents: EditorDocumentCopy
	) {}
	editorContent(document: ProseMirrorDocument): JSONContent {
		return this.documents.copy(this.presentation.prepare(document));
	}
	changedBlocks(previous: ProseMirrorDocument, next: ProseMirrorDocument): readonly number[] {
		return this.presentation.changedBlocks(previous, next);
	}
	outline(items: readonly OutlineSource[]): readonly OutlineHeading[] {
		return this.presentation.outline(items);
	}
	activeHeading(offsets: readonly OutlineOffset[], line: number): string | undefined {
		return this.presentation.activeHeading(offsets, line);
	}
}

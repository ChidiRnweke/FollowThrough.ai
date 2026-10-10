import type { Note, ProseMirrorDocument } from '$lib/models/notes';
import type { NoteEditorOperations } from '$lib/controllers/notes/editor-operations';

export class InMemoryWorkspaceEditor implements Pick<
	NoteEditorOperations,
	'getDocument' | 'getPlainText' | 'replaceDocument'
> {
	document: ProseMirrorDocument;
	plainText: string;
	constructor(note: Note) {
		this.document = note.document;
		this.plainText = note.plainText;
	}
	getDocument(): ProseMirrorDocument {
		return this.document;
	}
	getPlainText(): string {
		return this.plainText;
	}
	type(text: string): void {
		this.plainText = text;
		this.document = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
		};
	}
	replaceDocument(document: ProseMirrorDocument): void {
		this.document = document;
	}
}

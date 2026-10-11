import type { NoteMarkdownReader } from '$lib/models/note-markdown';
export class InMemoryNoteMarkdownReader implements NoteMarkdownReader {
	constructor(readonly read: NoteMarkdownReader['read']) {}
}

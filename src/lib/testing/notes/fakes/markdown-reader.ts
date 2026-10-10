import type { NoteMarkdownReader } from '$lib/server/controllers/notes/controller';
export class InMemoryNoteMarkdownReader implements NoteMarkdownReader {
	constructor(readonly read: NoteMarkdownReader['read']) {}
}

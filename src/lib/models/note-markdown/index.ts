import type { Note } from '$lib/models/notes';
export interface NoteMarkdownReader {
	read(markdown: string): Pick<Note, 'document' | 'plainText'>;
}
export interface NoteMarkdownWriter {
	write(document: Note['document']): string;
}
export interface NoteMarkdown extends NoteMarkdownReader, NoteMarkdownWriter {}

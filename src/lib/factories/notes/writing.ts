import { BrowserNoteWriting } from '$lib/client/notes/writing';
import { NoteWriting, type NoteWritingOperations } from '$lib/controllers/notes/writing';
export const noteWriting: NoteWritingOperations = new NoteWriting(new BrowserNoteWriting());

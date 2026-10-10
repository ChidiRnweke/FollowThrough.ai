import {
	NoteClipboard,
	type NoteClipboardOperations
} from '$lib/controllers/notes/clipboard-operations';
import { BrowserClipboardAppearance } from '$lib/client/clipboard/appearance';
import { BrowserClipboardReader } from '$lib/client/clipboard/reader';
import { BrowserClipboardFeedback } from '$lib/client/clipboard/feedback';
import { BrowserClipboardDocument } from '$lib/client/clipboard/document';
import { BrowserClipboardWriter } from '$lib/client/clipboard/writer';
import { readClipboardImage } from '$lib/client/clipboard/images';
import { BrowserMermaidRenderer } from '$lib/client/diagrams/mermaid-rendering';
import { BrowserMermaidImageOutput } from '$lib/client/diagrams/mermaid-export';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
import { noteEditorCapabilities } from './editor-capabilities';

export const noteClipboard: NoteClipboardOperations = new NoteClipboard({
	editors: noteEditorCapabilities,
	writer: new BrowserClipboardWriter(),
	reader: new BrowserClipboardReader(),
	feedback: new BrowserClipboardFeedback(),
	appearance: new BrowserClipboardAppearance(),
	themes: new MermaidThemeService(),
	renderer: new BrowserMermaidRenderer(),
	output: new BrowserMermaidImageOutput(),
	document: (content) => new BrowserClipboardDocument(content),
	readImage: readClipboardImage
});

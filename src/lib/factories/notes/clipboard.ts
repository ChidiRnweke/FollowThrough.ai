import { ClipboardTransfer, type NoteClipboardController } from '$lib/controllers/notes/clipboard';
import { BrowserClipboardDocument } from '$lib/client/clipboard/document';
import { BrowserClipboardWriter } from '$lib/client/clipboard/writer';
import { readClipboardImage } from '$lib/client/clipboard/images';
import { BrowserMermaidRenderer } from '$lib/client/diagrams/mermaid-rendering';
import { BrowserMermaidImageOutput } from '$lib/client/diagrams/mermaid-export';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
import { currentMermaidTheme } from '$lib/client/diagrams/mermaid-theme';

export const noteClipboard: NoteClipboardController = new ClipboardTransfer({
	writer: new BrowserClipboardWriter(),
	document: (content) => new BrowserClipboardDocument(content),
	readImage: readClipboardImage,
	mermaid: {
		themes: new MermaidThemeService(),
		renderer: new BrowserMermaidRenderer(),
		output: new BrowserMermaidImageOutput(),
		theme: currentMermaidTheme
	}
});

import {
	ClipboardDiagrams,
	type ClipboardDiagramOperations
} from '$lib/controllers/notes/clipboard-operations';
import { BrowserClipboardAppearance } from '$lib/client/clipboard/appearance';
import {
	NoteClipboard,
	type NoteClipboardOperations
} from '$lib/controllers/notes/clipboard-operations';
import { BrowserClipboardReader } from '$lib/client/clipboard/reader';
import { BrowserClipboardFeedback } from '$lib/client/clipboard/feedback';
import { createMermaidDiagrams } from '$lib/factories/diagrams/mermaid';
const mermaidDiagrams = createMermaidDiagrams();

import { ClipboardTransfer } from '$lib/controllers/notes/clipboard';
import { BrowserClipboardDocument } from '$lib/client/clipboard/document';
import { BrowserClipboardWriter } from '$lib/client/clipboard/writer';
import { readClipboardImage } from '$lib/client/clipboard/images';

const diagrams: ClipboardDiagramOperations = new ClipboardDiagrams(
	mermaidDiagrams,
	new BrowserClipboardAppearance()
);
const transfer = new ClipboardTransfer({
	writer: new BrowserClipboardWriter(),
	document: (content) => new BrowserClipboardDocument(content),
	readImage: readClipboardImage,
	renderDiagram: diagrams.render
});

export const noteClipboard: NoteClipboardOperations = new NoteClipboard(
	transfer,
	new BrowserClipboardWriter(),
	new BrowserClipboardReader(),
	new BrowserClipboardFeedback()
);

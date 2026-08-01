import { Fragment, Node as ProseMirrorNode, Slice } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { noteContentFromMarkdown } from './note-markdown.js';

/**
 * Pasting plain text that is secretly structured.
 *
 * Text copied out of a terminal, a chat, or a README arrives as `text/plain`, so the
 * editor used to drop it in verbatim: `# Heading` stayed a literal hash, lists stayed
 * dashes. Running it through the same Markdown parser the agent tools use turns it into
 * real headings, lists and tables — the "paste and it looks right" behaviour, with
 * Ctrl/⌘+Shift+V still available when the characters themselves are the point.
 */

/** Structure Markdown would express, and plain text would not. */
const MARKDOWN_SIGNALS: readonly RegExp[] = [
	/^\s{0,3}#{1,6}\s+\S/m, // heading
	/^\s{0,3}([-*+]|\d{1,9}[.)])\s+\S/m, // list item
	/^\s{0,3}>\s+\S/m, // blockquote
	/^\s{0,3}(```|~~~)/m, // fenced code
	/^\s{0,3}\|.*\|\s*$/m, // table row
	/^\s{0,3}(\*\s*){3,}$|^\s{0,3}(-\s*){3,}$/m, // thematic break
	/\[[^\]\n]+\]\([^)\s]+\)/, // link
	/\*\*[^*\n]+\*\*|__[^_\n]+__/, // bold
	/`[^`\n]+`/ // inline code
];

/**
 * Whether pasted plain text should be parsed rather than inserted literally.
 *
 * Blank-line separation counts on its own: several paragraphs of prose is the most
 * common structured paste there is, and inserting it verbatim collapses it into one.
 */
export const looksLikeMarkdown = (text: string): boolean => {
	if (!text.trim()) return false;
	if (/\n\s*\n/.test(text.trim())) return true;
	return MARKDOWN_SIGNALS.some((pattern) => pattern.test(text));
};

/**
 * A slice for the parsed text, or undefined when there is nothing better than the
 * default behaviour to offer.
 *
 * A result that is a single paragraph is handed back as its inline content so it merges
 * into the paragraph being pasted into, rather than splitting it in two.
 */
export const markdownSlice = (
	schema: ProseMirrorNode['type']['schema'],
	text: string
): Slice | undefined => {
	let document: ProseMirrorNode;
	try {
		document = ProseMirrorNode.fromJSON(schema, noteContentFromMarkdown(text).document);
	} catch {
		return undefined;
	}
	if (document.childCount === 0) return undefined;
	if (document.childCount === 1 && document.firstChild?.type.name === 'paragraph')
		return new Slice(document.firstChild.content, 0, 0);
	return new Slice(Fragment.from(document.content), 0, 0);
};

/**
 * Set while the user asks for one literal paste.
 *
 * Scoped to a single paste because it is a modifier on one gesture, not a mode — and
 * cleared on a timer so a Ctrl+Shift+V that never reaches a paste cannot leave the next
 * ordinary paste unformatted.
 */
let literalPasteArmed = false;
let disarm: ReturnType<typeof setTimeout> | undefined;

export const armLiteralPaste = (): void => {
	literalPasteArmed = true;
	if (disarm) clearTimeout(disarm);
	disarm = setTimeout(() => {
		literalPasteArmed = false;
	}, 1000);
};

const consumeLiteralPaste = (): boolean => {
	const armed = literalPasteArmed;
	literalPasteArmed = false;
	if (disarm) clearTimeout(disarm);
	return armed;
};

/** True when this keystroke is the request for a literal paste. */
export const isLiteralPasteShortcut = (event: KeyboardEvent): boolean =>
	(event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v';

/**
 * The first image file on the clipboard, when the paste carries one.
 *
 * Screenshots arrive as files, not text: the snipping-tool-style copy puts a
 * `File` on `clipboardData.files` and no usable `text/plain`, so the Markdown
 * path below never sees them.
 */
export const clipboardImage = (event: ClipboardEvent): File | undefined => {
	const files = event.clipboardData?.files;
	if (!files) return undefined;
	for (const file of files) {
		if (file.type.startsWith('image/')) return file;
	}
	return undefined;
};

/**
 * ProseMirror `handlePaste`. Returns true only when it has handled the paste itself.
 */
export const handleMarkdownPaste = (view: EditorView, event: ClipboardEvent): boolean => {
	const literal = consumeLiteralPaste();
	const clipboard = event.clipboardData;
	if (!clipboard) return false;

	const text = clipboard.getData('text/plain');
	if (!text) return false;

	if (literal) {
		event.preventDefault();
		view.dispatch(view.state.tr.insertText(text).scrollIntoView());
		return true;
	}

	// Real rich content already round-trips through ProseMirror's own HTML parser, which
	// knows more about the source document than a Markdown pass would.
	if (clipboard.getData('text/html')) return false;
	// Inside a code block or diagram source the characters are the content.
	if (view.state.selection.$from.parent.type.spec.code) return false;
	if (!looksLikeMarkdown(text)) return false;

	const slice = markdownSlice(view.state.schema, text);
	if (!slice) return false;

	event.preventDefault();
	view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
	return true;
};

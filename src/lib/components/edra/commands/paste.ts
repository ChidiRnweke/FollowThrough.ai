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
 * Remove clipboard padding that would parse as empty boundary paragraphs.
 *
 * Only whitespace joined to a line break is removed, so spaces deliberately copied on
 * the first or last content line and every internal paragraph break remain untouched.
 */
export const withoutBoundaryBlankLines = (text: string): string =>
	text.replace(/^(?:[^\S\r\n]*(?:\r\n|\r|\n))+/, '').replace(/(?:(?:\r\n|\r|\n)[^\S\r\n]*)+$/, '');

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
		document = ProseMirrorNode.fromJSON(
			schema,
			noteContentFromMarkdown(withoutBoundaryBlankLines(text)).document
		);
		// audit-allow: silent-catch — undefined is the parser's explicit “not valid Markdown document” result
	} catch {
		return undefined;
	}
	if (document.childCount === 0) return undefined;
	if (document.childCount === 1 && document.firstChild?.type.name === 'paragraph')
		return new Slice(document.firstChild.content, 0, 0);
	return new Slice(Fragment.from(document.content), 0, 0);
};

/**
 * Elements that carry only presentation — an editor or terminal's idea of "HTML".
 *
 * `pre` and `code` are here deliberately: an editor's wrapper is `white-space: pre`
 * styling around source text, and a genuine fenced block in that text still becomes a
 * code block by way of the Markdown parser.
 */
const STRUCTURELESS_TAGS = new Set(['DIV', 'SPAN', 'BR', 'P', 'FONT', 'PRE', 'CODE']);

/**
 * Whether pasted HTML says anything the plain text does not.
 *
 * VS Code, terminals and most code editors put a styled `div`/`span` tree on the clipboard
 * for every copy. It looks like HTML but encodes nothing — the meaning is still in the
 * characters, which is exactly the case the Markdown parser handles better than
 * ProseMirror's HTML parser does.
 */
export const htmlCarriesStructure = (html: string): boolean => {
	// A copy from this editor is always richer than a Markdown re-parse of its text.
	if (html.includes('data-pm-slice')) return true;
	// Without a parser there is nothing to judge, so keep the existing behaviour.
	if (typeof DOMParser === 'undefined') return true;

	const parsed = new DOMParser().parseFromString(html, 'text/html');
	for (const element of parsed.body.querySelectorAll('*')) {
		if (!STRUCTURELESS_TAGS.has(element.tagName)) return true;
	}
	return false;
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
 * Screenshots arrive as files, not text. Depending on the browser and operating
 * system, a snipping-tool-style copy may expose that file through `files` or only
 * through a file-kind item, with no usable `text/plain` in either case.
 */
export const clipboardImage = (event: ClipboardEvent): File | undefined => {
	const clipboard = event.clipboardData;
	if (!clipboard) return undefined;
	const files = clipboard.files;
	for (const file of files) {
		if (file.type.startsWith('image/')) return file;
	}
	// Windows Snipping Tool can expose its bitmap only as a file-kind item. Check
	// items after files so browsers that populate both representations still yield
	// one upload.
	for (const item of clipboard.items) {
		if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
		const file = item.getAsFile();
		if (file) return file;
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
	// knows more about the source document than a Markdown pass would. Styled `div`s from
	// an editor or a terminal are not that: they carry the source text and none of its
	// meaning, so a `.md` file copied out of VS Code would otherwise arrive preformatted.
	const html = clipboard.getData('text/html');
	if (html && htmlCarriesStructure(html)) return false;
	// Inside a code block or diagram source the characters are the content.
	if (view.state.selection.$from.parent.type.spec.code) return false;
	if (!looksLikeMarkdown(text)) return false;

	const slice = markdownSlice(view.state.schema, text);
	if (!slice) return false;

	event.preventDefault();
	view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
	return true;
};

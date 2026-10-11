// Accepted workaround: the note schema is a vendored editor dependency kept in infrastructure,
// outside the architecture checks, because the editor and the server share these module-level
// definitions. See `../markdown.ts`.
import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Heading } from '@tiptap/extension-heading';
import Highlight from '@tiptap/extension-highlight';
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import SuperScript from '@tiptap/extension-superscript';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import { Marked, marked, type MarkedExtension, type MarkedOptions } from 'marked';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import type { KatexOptions } from 'katex';
import Audio from '@tiptap/extension-audio';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import { NoteTable, NoteTableCell, NoteTableHeader, NoteTableRow } from './tables';
import { ImageNode } from './image';
import { VideoNode } from './video';
import {
	AIHighlightNode,
	CalloutNode,
	DrawioNode,
	IFrameNode,
	MermaidNode,
	NoteLinkMark,
	TodoNodeBase,
	WidgetNodeBase
} from './nodes';

/** Options for the KaTeX renderer. See here: https://katex.org/docs/options.html */
const katexOptions: KatexOptions = {
	// Show invalid LaTeX as red source text rather than throwing inside a node view.
	throwOnError: false,
	// Unicode inside a formula (an en-dash, an accented letter) is something the author
	// can see on the page; it does not need a console warning on every load.
	strict: 'ignore',
	macros: {
		'\\R': '\\mathbb{R}', // add a macro for the real numbers
		'\\N': '\\mathbb{N}' // add a macro for the natural numbers
	}
};

/**
 * Inline math is delimited `$$…$$`, not `$…$`.
 *
 * The upstream Markdown tokenizer matches a single `$…$`, which turns ordinary currency
 * — "$4–13 vs $30 per 1,000 pages" — into a math node and deletes the text from both the
 * document and its plain-text index. The extension's own typing input rule already
 * requires `$$`, so this only brings the Markdown path in line with the editor path.
 * `renderMarkdown` moves with it, or the round trip would stop being lossless.
 */
const StrictInlineMath = InlineMath.extend({
	markdownTokenizer: {
		name: 'inlineMath',
		level: 'inline',
		start: (src) => src.indexOf('$$'),
		tokenize: (src) => {
			const match = /^\$\$([^$\n]+?)\$\$(?!\$)/.exec(src);
			if (!match) return undefined;
			return { type: 'inlineMath', raw: match[0], latex: match[1].trim() };
		}
	},
	renderMarkdown: (node) => `$$${node.attrs?.latex ?? ''}$$`
});

const isolatedMarkedInstance = new Marked();

function parseIsolatedMarkdown(
	source: string,
	options: MarkedOptions & { async: true }
): Promise<string>;
function parseIsolatedMarkdown(source: string, options: MarkedOptions & { async: false }): string;
function parseIsolatedMarkdown(
	source: string,
	options?: MarkedOptions | null
): string | Promise<string>;
function parseIsolatedMarkdown(
	source: string,
	options?: MarkedOptions | null
): string | Promise<string> {
	return isolatedMarkedInstance.parse(source, options);
}

const isolatedMarkdownParser: typeof marked = Object.assign(parseIsolatedMarkdown, marked, {
	options: (options: MarkedOptions) => {
		isolatedMarkedInstance.options(options);
		return isolatedMarkdownParser;
	},
	setOptions: (options: MarkedOptions) => {
		isolatedMarkedInstance.setOptions(options);
		return isolatedMarkdownParser;
	},
	defaults: isolatedMarkedInstance.defaults,
	use: (...extensions: MarkedExtension[]) => {
		isolatedMarkedInstance.use(...extensions);
		return isolatedMarkdownParser;
	},
	walkTokens: isolatedMarkedInstance.walkTokens.bind(isolatedMarkedInstance),
	parseInline: isolatedMarkedInstance.parseInline,
	Parser: isolatedMarkedInstance.Parser,
	parser: isolatedMarkedInstance.parser.bind(isolatedMarkedInstance),
	Renderer: isolatedMarkedInstance.Renderer,
	TextRenderer: isolatedMarkedInstance.TextRenderer,
	Lexer: isolatedMarkedInstance.Lexer,
	lexer: isolatedMarkedInstance.lexer.bind(isolatedMarkedInstance),
	Tokenizer: isolatedMarkedInstance.Tokenizer,
	Hooks: isolatedMarkedInstance.Hooks,
	parse: parseIsolatedMarkdown
});

/**
 * Block math starts a line, or it is inline math.
 *
 * Marked truncates the enclosing paragraph wherever a block tokenizer's `start` points,
 * so the upstream `indexOf('$$')` tore "so $$x^2$$ then" into three blocks and claimed
 * the formula for `blockMath` before {@link StrictInlineMath} could see it. Only
 * `tokenize` decides what a block is; `start` just has to stop pointing mid-sentence.
 */
const StrictBlockMath = BlockMath.extend({
	markdownTokenizer: {
		name: 'blockMath',
		level: 'block',
		start: (src) => {
			const match = /(?:^|\n)\$\$/.exec(src);
			if (!match) return -1;
			return match.index === 0 ? 0 : match.index + 1;
		},
		tokenize: (src) => {
			const match = /^\$\$([^$]+)\$\$/.exec(src);
			if (!match) return undefined;
			return { type: 'blockMath', raw: match[0], latex: match[1].trim() };
		}
	}
});

/** Headings stop at level four. The editor adds its Enter behavior to this definition. */
export const NoteHeading = Heading.configure({ levels: [1, 2, 3, 4] });

/**
 * The schema the editor builds on: every node, mark and global attribute it can store,
 * with no editor behavior attached.
 *
 * The editor replaces the heading and table definitions with extended copies of these,
 * and adds the extensions that only act on a live view (placeholder, typography, color
 * highlighting, heading spacing, list numbering, character count).
 */
export const noteBaseExtensions: Extensions = [
	StarterKit.configure({
		orderedList: {
			HTMLAttributes: {
				class: 'list-decimal'
			}
		},
		bulletList: {
			HTMLAttributes: {
				class: 'list-disc'
			}
		},
		// Link and Heading are supplied as extended copies below — StarterKit options
		// can configure neither the link mark's `inclusive` spec nor keyboard shortcuts.
		link: false,
		heading: false,
		codeBlock: false
	}),
	// Tiptap v3 made the link mark's `inclusive()` return `options.autolink`; with
	// autolink on, typing after an autolinked URL — spaces included — extends the
	// link forever. v2 hardcoded `inclusive: false`; this restores that while
	// keeping autolink itself.
	Link.extend({ inclusive: false }).configure({
		openOnClick: false,
		autolink: true,
		linkOnPaste: true,
		HTMLAttributes: {
			target: '_blank',
			rel: 'noopener noreferrer nofollow'
		}
	}),
	NoteHeading,
	Audio.configure({
		inline: true,
		HTMLAttributes: {
			width: '100%',
			height: '100%'
		}
	}),
	Highlight.configure({
		multicolor: true
	}),
	Color,
	Subscript,
	SuperScript,
	TextStyle,
	FontSize,
	TextAlign.configure({
		types: ['heading', 'paragraph']
	}),
	TaskList,
	TaskItem.configure({
		nested: true
	}),
	NoteTable,
	NoteTableHeader,
	NoteTableRow,
	NoteTableCell,
	// Tiptap registers its tokenizers on this callable adapter over a dedicated
	// Marked instance, leaving the process-wide singleton untouched.
	Markdown.configure({ marked: isolatedMarkdownParser }),
	// Listed as the two halves rather than the `Mathematics` bundle, which is only a
	// wrapper around `[BlockMath, InlineMath]` and leaves no way to harden the inline one.
	StrictBlockMath.configure({ katexOptions }),
	StrictInlineMath.configure({ katexOptions })
];

/**
 * The application's own nodes and marks, plus the code block, image and video nodes the
 * editor replaces with node-view copies.
 */
export const noteNodeExtensions: Extensions = [
	// The base list leaves out StarterKit's code block so the editor can supply a
	// highlighted one; the language registry stays empty here because Markdown output
	// depends only on the `language` attribute, not on tokenization.
	CodeBlockLowlight.configure({ lowlight: createLowlight() }),
	ImageNode,
	VideoNode,
	IFrameNode,
	MermaidNode,
	DrawioNode,
	CalloutNode,
	TodoNodeBase,
	WidgetNodeBase,
	AIHighlightNode,
	NoteLinkMark
];

/**
 * The note schema, headless.
 *
 * Notes are stored as ProseMirror JSON; Markdown is a conversion layer the agent tools
 * and the importer speak. A node missing from this list is not "rendered plainly" — it
 * is erased, and serializing a note containing one silently replaces the diagram, table
 * or callout with an empty paragraph. The editor extends these same definitions, so the
 * two cannot drift.
 *
 * The only deliberate omissions are view-layer extensions that contribute no schema
 * (slash command, table of contents, inline suggestions, diagram deletion) and
 * `mediaPlaceholder`, which represents an upload still in flight and has no Markdown
 * form worth preserving.
 */
export const noteDocumentExtensions: Extensions = [...noteBaseExtensions, ...noteNodeExtensions];

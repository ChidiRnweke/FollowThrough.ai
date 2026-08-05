import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Heading } from '@tiptap/extension-heading';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import strings from './strings.js';
import Highlight from '@tiptap/extension-highlight';
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
import Typography from '@tiptap/extension-typography';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import SuperScript from '@tiptap/extension-superscript';
import ColorHighlighter from './ColorHighlighter.js';
// Imported directly rather than through `./index.js`: that barrel also re-exports
// the editor's Svelte-bearing modules, and this extension set is shared with the
// headless Markdown schema the server and worker load.
import { Table } from './table.js';
import { TableCell } from './table-cell.js';
import { TableHeader } from './table-header.js';
import { TableRow } from './table-row.js';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { HeadingSpacing } from './heading-spacing.js';
import { Markdown } from '@tiptap/markdown';
import { Marked } from 'marked';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import type { KatexOptions } from 'katex';
import Audio from '@tiptap/extension-audio';

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

/**
 * Contains all the default extensions the editor uses.
 */
export default [
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
	// Default Enter only exits a heading when the caret is at the very end; a
	// mid-heading split keeps the tail a heading. Force every Enter inside a
	// heading to land in a paragraph (Notion-style): an empty heading converts in
	// place, otherwise split and convert the new block. At the end of a heading
	// `splitBlock` already creates a paragraph, so `setParagraph` is a no-op that
	// fails the chain — which is why the shortcut must not relay the chain's
	// return value: a false here would let the core Enter binding run as well
	// and insert a second block.
	//
	// The start and end of a title are inserted directly rather than split:
	// `splitBlock` next to an atom or a table drops the new block on the far side
	// of the heavy node (the paragraph lands after the mermaid, not between it
	// and the title), and a split at the very first position converts the title
	// itself into a paragraph. An explicit insert at the heading's boundary is
	// deterministic and never reaches into a following diagram's source.
	Heading.extend({
		addKeyboardShortcuts() {
			return {
				...this.parent?.(),
				Enter: ({ editor }) => {
					const { $head, empty } = editor.state.selection;
					if (editor.isActive('heading')) {
						if (empty && $head.parent.content.size === 0) {
							return editor.chain().setParagraph().run();
						}
						if (empty && $head.parentOffset === $head.parent.content.size) {
							// Position after the heading block: `$head.after()` would point
							// at the caret's own text-node depth, i.e. inside the heading.
							const after = $head.pos - $head.parentOffset + $head.parent.nodeSize - 1;
							editor.chain().insertContentAt(after, { type: 'paragraph' }).run();
							return true;
						}
						if (empty && $head.parentOffset === 0) {
							// Position before the heading block, so the title survives.
							const before = $head.pos - $head.parentOffset - 1;
							editor.chain().insertContentAt(before, { type: 'paragraph' }).run();
							return true;
						}
						editor.chain().splitBlock().setParagraph().run();
						return true;
					}
					// The very end of a heading's text resolves at doc level, so
					// `isActive('heading')` is false there and the caret sits right
					// after or before a heading node. Enter must still produce a
					// paragraph at that boundary — and must not send it past a
					// following diagram or table the way the default keymap does.
					if (
						empty &&
						($head.nodeBefore?.type.name === 'heading' || $head.nodeAfter?.type.name === 'heading')
					) {
						editor.chain().insertContentAt($head.pos, { type: 'paragraph' }).run();
						return true;
					}
					return false;
				}
			};
		}
	}).configure({ levels: [1, 2, 3, 4] }),
	// Keeps titles separated from diagrams and tables the moment they become
	// adjacent (agent-written notes, a pasted heading, an inserted diagram).
	HeadingSpacing,
	Audio.configure({
		inline: true,
		HTMLAttributes: {
			width: '100%',
			height: '100%'
		}
	}),
	CharacterCount,
	Highlight.configure({
		multicolor: true
	}),
	Placeholder.configure({
		// Must stay distinct from Tiptap's default `emptyNodeClass: 'is-empty'`.
		// Setting this to 'is-empty' too collapsed the two into one class, so the
		// CSS could no longer tell "empty document" from "empty paragraph in the
		// middle of a written note" — and the placeholder showed in both.
		emptyEditorClass: 'is-editor-empty',
		// Use a placeholder:
		// Use different placeholders depending on the node type:
		placeholder: ({ node }) => {
			if (node.type.name === 'heading') {
				return strings.editor.headingPlaceholder;
			}
			if (node.type.name === 'paragraph') {
				return strings.editor.paragraphPlaceholder;
			}
			return '';
		}
	}),
	Color,
	Subscript,
	SuperScript,
	Typography,
	ColorHighlighter,
	TextStyle,
	FontSize,
	TextAlign.configure({
		types: ['heading', 'paragraph']
	}),
	TaskList,
	TaskItem.configure({
		nested: true
	}),
	// SearchAndReplace,
	Table,
	TableHeader,
	TableRow,
	TableCell,
	// Dedicated marked instance: without it, the MarkdownManager registers its
	// tokenizer-only extensions (inlineMath/blockMath) on the global marked
	// singleton, breaking every other marked.parse caller in the app. The cast
	// bridges Tiptap's `typeof marked` option type — the instance has everything
	// MarkdownManager actually uses (use/setOptions/lexer/Lexer).
	Markdown.configure({ marked: new Marked() as unknown as (typeof import('marked'))['marked'] }),
	// Listed as the two halves rather than the `Mathematics` bundle, which is only a
	// wrapper around `[BlockMath, InlineMath]` and leaves no way to harden the inline one.
	StrictBlockMath.configure({ katexOptions }),
	StrictInlineMath.configure({ katexOptions })
] as Extensions;

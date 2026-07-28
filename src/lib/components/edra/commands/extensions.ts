import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import strings from './strings.js';
import Highlight from '@tiptap/extension-highlight';
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
import Typography from '@tiptap/extension-typography';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import SuperScript from '@tiptap/extension-superscript';
import ColorHighlighter from './ColorHighlighter.js';
import { Table, TableCell, TableHeader, TableRow } from './index.js';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import { Marked } from 'marked';
import Mathematics from '@tiptap/extension-mathematics';
import Audio from '@tiptap/extension-audio';

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
		heading: {
			levels: [1, 2, 3, 4]
		},
		link: {
			openOnClick: false,
			autolink: true,
			linkOnPaste: true,
			HTMLAttributes: {
				target: '_blank',
				rel: 'noopener noreferrer nofollow'
			}
		},
		codeBlock: false
	}),
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
	Mathematics.configure({
		// Options for the KaTeX renderer. See here: https://katex.org/docs/options.html
		katexOptions: {
			throwOnError: true, // don't throw an error if the LaTeX code is invalid
			macros: {
				'\\R': '\\mathbb{R}', // add a macro for the real numbers
				'\\N': '\\mathbb{N}' // add a macro for the natural numbers
			}
		}
	})
] as Extensions;

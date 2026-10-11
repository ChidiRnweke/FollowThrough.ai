import type { AnyExtension, Extensions } from '@tiptap/core';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import Typography from '@tiptap/extension-typography';
import { noteBaseExtensions, NoteHeading } from '$lib/infrastructure/notes/schema/extensions';
import strings from './strings.js';
import ColorHighlighter from './ColorHighlighter.js';
// Imported directly rather than through `./index.js`: that barrel also re-exports
// the editor's Svelte-bearing modules, and this extension set is loaded headless in specs.
import { Table } from './table.js';
import { TableCell } from './table-cell.js';
import { TableHeader } from './table-header.js';
import { HeadingSpacing } from './heading-spacing.js';
import { OrderedListNumbering } from './ordered-list-numbering.js';

// Default Enter only exits a heading when the caret is at the very end; a
// mid-heading split keeps the tail a heading. Force every Enter inside a
// heading to land in a paragraph (Notion-style): an empty heading converts in
// place, otherwise split and convert the new block.
//
// The start and end of a title are inserted directly rather than split.
// `splitBlock` fails when the next block is not a paragraph — a title above
// a bulleted list, table or diagram could not gain a blank line below it —
// and a split at the very first position converts the title itself into a
// paragraph. An explicit insert at the heading's boundary is deterministic
// and never reaches into a following block's content.
const EditorHeading = NoteHeading.extend({
	addKeyboardShortcuts() {
		return {
			...this.parent?.(),
			Enter: ({ editor }) => {
				if (!editor.isActive('heading')) return false;
				const { $head, empty } = editor.state.selection;
				if (empty && $head.parent.content.size === 0) {
					return editor.chain().setParagraph().run();
				}
				if (empty && $head.parentOffset === 0) {
					editor
						.chain()
						.insertContentAt($head.pos - 1, { type: 'paragraph' })
						.run();
					return true;
				}
				if (empty && $head.parentOffset === $head.parent.content.size) {
					// Position after the heading block, before whatever follows it.
					const after = $head.pos - $head.parentOffset + $head.parent.nodeSize - 1;
					editor.chain().insertContentAt(after, { type: 'paragraph' }).run();
					return true;
				}
				editor.chain().splitBlock().setParagraph().run();
				return true;
			}
		};
	}
});

/** Schema definitions the editor replaces with copies that carry its behavior. */
const editorBehavior: Readonly<Record<string, AnyExtension>> = {
	heading: EditorHeading,
	table: Table,
	tableHeader: TableHeader,
	tableCell: TableCell
};

/**
 * Contains all the default extensions the editor uses: the note schema with editor
 * behavior attached, and the extensions that only act on a live view.
 */
export default [
	...noteBaseExtensions.map((extension) => editorBehavior[extension.name] ?? extension),
	// Keeps titles separated from diagrams the moment they become adjacent
	// (agent-written notes, a pasted heading, an inserted diagram).
	HeadingSpacing,
	// Renumbers numbered lists when a deletion touches them, and merges two
	// lists that a removed paragraph left adjacent.
	OrderedListNumbering,
	CharacterCount,
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
	Typography,
	ColorHighlighter
] as Extensions;

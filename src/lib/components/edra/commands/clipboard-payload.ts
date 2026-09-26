import { getTextBetween, getTextSerializersFromSchema } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import { selectionMedia } from './diagram-copy.js';
import { noteMarkdownFromContent } from './note-markdown.js';
import { withoutClipboardPadding } from './paste-slice.js';
import { withoutBoundaryBlankLines } from './paste.js';
import { parseEdraDocument } from './document.js';

const BLOCK_SEPARATOR = '\n\n';

/** Serialized editor selection passed to the host's clipboard handler. */
export type SerializedSelection =
	| { readonly kind: 'rich'; readonly html: string; readonly text: string }
	| { readonly kind: 'image' | 'diagram'; readonly source: string; readonly text: string };

/** A range of the document, in ProseMirror positions. */
export interface SelectedRange {
	readonly from: number;
	readonly to: number;
}

/**
 * The same state with `range` selected again.
 *
 * A right-click collapses the selection unless it lands on it, and opening a context menu
 * moves focus off the contenteditable — so by the time a menu item is clicked, the range
 * the reader meant to copy is gone from `state.selection` and every copy comes out empty.
 * The menu captures the range as it opens; this puts it back on a state, without touching
 * the view, so the copy describes the selection rather than the caret that replaced it.
 *
 * `TextSelection.between` rather than `create`: the endpoints are re-resolved against the
 * live document, and a position that no longer points into inline content resolves to the
 * nearest one that does instead of throwing.
 */
export const selectRange = (state: EditorState, range: SelectedRange | undefined): EditorState => {
	if (!range) return state;
	const limit = state.doc.content.size;
	const from = Math.min(Math.max(range.from, 0), limit);
	const to = Math.min(Math.max(range.to, 0), limit);
	if (from >= to) return state;
	return state.apply(
		state.tr.setSelection(TextSelection.between(state.doc.resolve(from), state.doc.resolve(to)))
	);
};

/**
 * Plain text of the current selection, '' when there is none.
 *
 * Trailing line breaks in the selection serialize to blank lines, which paste back as
 * blank lines wherever the text lands. See paste-slice: they are padding, not content.
 */
export const selectionPlainText = (state: EditorState): string => {
	const { from, to, empty } = state.selection;
	if (empty) return '';
	return withoutBoundaryBlankLines(
		getTextBetween(
			state.doc,
			{ from, to },
			{
				blockSeparator: BLOCK_SEPARATOR,
				textSerializers: getTextSerializersFromSchema(state.schema)
			}
		)
	);
};

/**
 * The current selection as Markdown, '' when there is none.
 *
 * Deliberately the same serializer the agent tools, the import path and the patch preview
 * use: a note copied out and a note described to the agent have to read identically, or a
 * targeted edit would anchor against text the user never saw.
 */
export const selectionMarkdown = (state: EditorState): string => {
	if (state.selection.empty) return '';
	const content = withoutClipboardPadding(state.selection.content()).content.toJSON();
	if (!content) return '';
	const document = parseEdraDocument({ type: 'doc', content });
	return noteMarkdownFromContent(document);
};

/** Serialize the captured editor selection before asynchronous clipboard preparation begins. */
export const clipboardSource = (state: EditorState): SerializedSelection => {
	const lone = selectionMedia(state).lone;
	if (lone?.kind === 'mermaid') return { kind: 'diagram', source: lone.source, text: lone.source };
	if (lone?.kind === 'image')
		return { kind: 'image', source: lone.src, text: selectionPlainText(state) };
	const container = document.createElement('div');
	container.append(
		DOMSerializer.fromSchema(state.schema).serializeFragment(
			withoutClipboardPadding(state.selection.content()).content
		)
	);
	return { kind: 'rich', html: container.innerHTML, text: selectionPlainText(state) };
};

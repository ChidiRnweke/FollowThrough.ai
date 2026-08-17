import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { AllSelection, EditorState, TextSelection } from '@tiptap/pm/state';
import { noteMarkdownExtensions } from './markdown-extensions';
import { selectRange, selectionMarkdown } from './clipboard-payload';

/**
 * "Copy as markdown" has to describe the note the same way the agent's `edit_note` patch
 * does, so it shares the one serializer rather than flattening the selection to text.
 */
const schema = getSchema(noteMarkdownExtensions);

const stateOf = (content: readonly Record<string, unknown>[]): EditorState =>
	EditorState.create({
		doc: ProseMirrorNode.fromJSON(schema, { type: 'doc', content })
	});

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('Copying a selection as Markdown', () => {
	const state = stateOf([
		{
			type: 'heading',
			attrs: { level: 2 },
			content: [{ type: 'text', text: 'Release notes' }]
		},
		{
			type: 'bulletList',
			content: [
				{ type: 'listItem', content: [paragraph('one')] },
				{ type: 'listItem', content: [paragraph('two')] }
			]
		}
	]);
	const markdown = selectionMarkdown(
		state.apply(state.tr.setSelection(new AllSelection(state.doc)))
	);

	it('writes a heading as Markdown syntax', () => {
		expect(markdown).toContain('## Release notes');
	});

	it('writes a list as Markdown syntax', () => {
		expect(markdown).toContain('one');
	});

	it('keeps the list items on separate lines', () => {
		expect(markdown.split('\n').filter((line) => line.trim().endsWith('two'))).toHaveLength(1);
	});
});

describe('Copying part of a paragraph as Markdown', () => {
	const state = stateOf([paragraph('this is important')]);
	const selected = state.apply(
		state.tr.setSelection(TextSelection.create(state.doc, 1, 'this is'.length + 1))
	);

	it('writes only the selected text', () => {
		expect(selectionMarkdown(selected).trim()).toBe('this is');
	});
});

describe('Copying with nothing selected', () => {
	it('produces no Markdown', () => {
		expect(selectionMarkdown(stateOf([paragraph('untouched')]))).toBe('');
	});
});

/**
 * A selection rarely lands on node boundaries. Dragging from the middle of one list item
 * into the middle of the next produces an open slice — partial nodes at both ends — which
 * is the shape a whole-document serializer never sees.
 */
describe('Copying a selection that cuts across nodes', () => {
	const state = stateOf([
		{
			type: 'bulletList',
			content: [
				{ type: 'listItem', content: [paragraph('first item')] },
				{ type: 'listItem', content: [paragraph('second item')] }
			]
		}
	]);
	const openSlice = state.apply(
		state.tr.setSelection(TextSelection.create(state.doc, 5, state.doc.content.size - 4))
	);

	it('still writes list syntax for a partial list selection', () => {
		expect(selectionMarkdown(openSlice)).toContain('-');
	});

	it('keeps the text that was actually selected', () => {
		expect(selectionMarkdown(openSlice)).toContain('item');
	});
});

/**
 * Opening the context menu focuses the menu, and the browser collapses the selection in
 * the contenteditable when focus leaves it — so the state a menu item sees has a caret
 * where the reader had a range. The menu remembers the range and puts it back.
 */
describe('Copying the range a context menu was opened over', () => {
	const state = stateOf([paragraph('this is important')]);
	const collapsed = state.apply(
		state.tr.setSelection(TextSelection.create(state.doc, 'this is'.length + 1))
	);

	it('copies nothing from the collapsed selection the menu leaves behind', () => {
		expect(selectionMarkdown(collapsed)).toBe('');
	});

	it('copies the remembered range instead', () => {
		expect(selectionMarkdown(selectRange(collapsed, { from: 1, to: 8 })).trim()).toBe('this is');
	});

	it('leaves the state alone when nothing was remembered', () => {
		expect(selectRange(collapsed, undefined).selection.empty).toBe(true);
	});

	it('leaves the state alone when the range is empty', () => {
		expect(selectRange(collapsed, { from: 4, to: 4 }).selection.empty).toBe(true);
	});

	it('clamps a range that outlived the text it pointed at', () => {
		expect(selectionMarkdown(selectRange(collapsed, { from: 1, to: 9_999 })).trim()).toBe(
			'this is important'
		);
	});
});

/**
 * A range that spans block boundaries cannot be resolved as-is at both ends; the nearest
 * inline positions have to stand in, rather than the copy throwing.
 */
describe('Remembering a range whose endpoints are not inline', () => {
	const state = stateOf([paragraph('first'), paragraph('second')]);
	const collapsed = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));

	it('still copies across the block boundary', () => {
		expect(
			selectionMarkdown(selectRange(collapsed, { from: 0, to: state.doc.content.size }))
		).toContain('second');
	});
});

describe('Copying a selection containing a table', () => {
	const cell = (text: string) => ({ type: 'tableCell', content: [paragraph(text)] });
	const state = stateOf([
		{
			type: 'table',
			content: [{ type: 'tableRow', content: [cell('Name'), cell('Role')] }]
		}
	]);
	const selected = state.apply(state.tr.setSelection(new AllSelection(state.doc)));

	it('writes the table rather than dropping it', () => {
		expect(selectionMarkdown(selected)).toContain('Name');
	});
});

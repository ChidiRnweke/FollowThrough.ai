// @vitest-environment jsdom

import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { noteMarkdownExtensions } from './markdown-extensions';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

const heading = (text: string): JSONContent => ({
	type: 'heading',
	attrs: { level: 2 },
	content: [{ type: 'text', text }]
});
const paragraph: JSONContent = { type: 'paragraph' };
const table: JSONContent = {
	type: 'table',
	content: [
		{
			type: 'tableRow',
			content: [
				{
					type: 'tableCell',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] }]
				}
			]
		}
	]
};
const createEditor = (content: JSONContent) => {
	const editor = new Editor({
		element: document.createElement('div'),
		extensions: noteMarkdownExtensions
	});
	editors.push(editor);
	editor.chain().setContent(content).setMeta('addToHistory', false).run();
	return editor;
};
const blocks = (editor: Editor) => editor.state.doc.content.content.map((node) => node.type.name);

function deleteGap(side: 'before' | 'after') {
	const content =
		side === 'before'
			? [heading('Before'), paragraph, table, heading('After'), paragraph]
			: [heading('Before'), table, paragraph, heading('After'), paragraph];
	const editor = createEditor({ type: 'doc', content });
	const gapIndex = side === 'before' ? 1 : 2;
	let position = 1;
	for (let index = 0; index < gapIndex; index += 1)
		position += editor.state.doc.child(index).nodeSize;
	editor.commands.setTextSelection(position);
	editor.view.dom.dispatchEvent(
		new KeyboardEvent('keydown', {
			key: side === 'before' ? 'Delete' : 'Backspace',
			bubbles: true,
			cancelable: true
		})
	);
	return editor;
}

describe('author-controlled spacing beside tables and headings', () => {
	it('loads adjacent headings and a table without adding gaps', () => {
		const editor = createEditor({
			type: 'doc',
			content: [heading('Before'), table, heading('After'), paragraph]
		});
		expect(blocks(editor)).toEqual(['heading', 'table', 'heading', 'paragraph']);
	});

	it('preserves paragraphs the author has not deleted', () => {
		const editor = createEditor({
			type: 'doc',
			content: [heading('Before'), paragraph, table, paragraph, heading('After'), paragraph]
		});
		expect(blocks(editor)).toEqual([
			'heading',
			'paragraph',
			'table',
			'paragraph',
			'heading',
			'paragraph'
		]);
	});

	it.each(['before', 'after'] as const)(
		'deletes the empty paragraph %s a table without changing its content',
		(side) => {
			const editor = deleteGap(side);
			expect(editor.getJSON().content).toMatchObject([
				{ type: 'heading' },
				table,
				{ type: 'heading' },
				paragraph
			]);
		}
	);

	it.each(['before', 'after'] as const)(
		'does not restore a deleted gap %s a table after typing',
		(side) => {
			const editor = deleteGap(side);
			editor.commands.insertContentAt(1, 'Updated ');
			expect(blocks(editor)).toEqual(['heading', 'table', 'heading', 'paragraph']);
		}
	);

	it.each(['before', 'after'] as const)('undo restores the deleted gap %s a table', (side) => {
		const editor = deleteGap(side);
		editor.commands.undo();
		expect(blocks(editor)).toEqual(
			side === 'before'
				? ['heading', 'paragraph', 'table', 'heading', 'paragraph']
				: ['heading', 'table', 'paragraph', 'heading', 'paragraph']
		);
	});

	it('keeps deleted gaps absent when the document is serialized and reopened', () => {
		const editor = deleteGap('before');
		const reopened = createEditor(editor.getJSON());
		expect(blocks(reopened)).toEqual(['heading', 'table', 'heading', 'paragraph']);
	});
});

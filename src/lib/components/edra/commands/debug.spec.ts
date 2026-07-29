// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { noteMarkdownExtensions } from './markdown-extensions';

const createEditor = (content: Record<string, unknown>) =>
	new Editor({
		element: document.createElement('div'),
		extensions: noteMarkdownExtensions,
		content
	});

const pressEnter = (editor: Editor) => {
	editor.view.dom.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
	);
};

describe('debug', () => {
	it('trailing paragraph origin', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', text: 'Title' }]
				}
			]
		});
		console.log('initial:', JSON.stringify(editor.getJSON().content?.map((b) => b.type)));
		console.log('selection:', editor.state.selection.from, editor.state.selection.to);
		expect(true).toBe(true);
	});

	it('real keydown Enter mid-heading', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', text: 'Hello World' }]
				}
			]
		});
		editor.commands.setTextSelection(4); // mid-heading
		pressEnter(editor);
		console.log(
			'mid after Enter:',
			JSON.stringify(
				editor.getJSON().content?.map((b) => [b.type, b.content?.map((t) => t.text)])
			)
		);
		expect(true).toBe(true);
	});

	it('real keydown Enter end of heading', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', text: 'Title' }]
				}
			]
		});
		editor.commands.setTextSelection(6); // end of "Title"
		pressEnter(editor);
		console.log(
			'end after Enter:',
			JSON.stringify(
				editor.getJSON().content?.map((b) => [b.type, b.content?.map((t) => t.text)])
			)
		);
		expect(true).toBe(true);
	});
});

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

/** Route text through ProseMirror's real typing path so mark behaviour matches the browser. */
const type = (editor: Editor, text: string) => {
	const { from, to } = editor.state.selection;
	editor.view.someProp('handleTextInput', (f) => f(editor.view, from, to, text));
};

const blockTypes = (editor: Editor) =>
	editor.getJSON().content?.map((block) =>
		block.type === 'heading' ? `heading-${block.attrs?.level}` : block.type
	);

describe('link mark boundaries', () => {
	it('autolinks a typed URL but does not extend the link past the following space', () => {
		const editor = createEditor({
			type: 'doc',
			content: [{ type: 'paragraph' }]
		});

		type(editor, 'https://example.com');
		type(editor, ' ');
		type(editor, 'and more');

		const [paragraph] = editor.getJSON().content ?? [];
		const linkText = paragraph.content?.find((node) =>
			node.marks?.some((mark) => mark.type === 'link')
		);
		expect(linkText?.text).toBe('https://example.com');
		expect(
			paragraph.content
				?.filter((node) => !node.marks?.some((mark) => mark.type === 'link'))
				.map((node) => node.text)
				.join('')
		).toBe(' and more');
		expect(editor.isActive('link')).toBe(false);
		editor.destroy();
	});

	it('does not extend an existing link when typing at its end boundary', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'see ' },
						{
							type: 'text',
							text: 'https://example.com',
							marks: [{ type: 'link', attrs: { href: 'https://example.com' } }]
						}
					]
				}
			]
		});

		editor.commands.focus('end');
		type(editor, ' and more');

		const [paragraph] = editor.getJSON().content ?? [];
		const last = paragraph.content?.at(-1);
		expect(last?.text).toBe(' and more');
		expect(last?.marks ?? []).toEqual([]);
		editor.destroy();
	});
});

describe('heading Enter behaviour', () => {
	const headingDoc = (text: string) => ({
		type: 'doc',
		content: [
			{
				type: 'heading',
				attrs: { level: 1 },
				content: text ? [{ type: 'text', text }] : undefined
			}
		]
	});

	it('exits to a paragraph when Enter is pressed at the end of a heading', () => {
		const editor = createEditor(headingDoc('Title'));
		editor.commands.focus('end');

		editor.commands.keyboardShortcut('Enter');

		expect(blockTypes(editor)).toEqual(['heading-1', 'paragraph']);
		editor.destroy();
	});

	it('turns the split tail into a paragraph when Enter is pressed mid-heading', () => {
		const editor = createEditor(headingDoc('Hello World'));
		editor.commands.setTextSelection(7); // after "Hello "

		editor.commands.keyboardShortcut('Enter');

		expect(blockTypes(editor)).toEqual(['heading-1', 'paragraph']);
		const [heading, paragraph] = editor.getJSON().content ?? [];
		expect(heading.content?.[0]?.text).toBe('Hello ');
		expect(paragraph.content?.[0]?.text).toBe('World');
		editor.destroy();
	});

	it('converts an empty heading in place instead of stacking another heading', () => {
		const editor = createEditor(headingDoc(''));
		editor.commands.focus('end');

		editor.commands.keyboardShortcut('Enter');

		expect(blockTypes(editor)).toEqual(['paragraph']);
		editor.destroy();
	});
});

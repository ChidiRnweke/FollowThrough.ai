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

interface JSONBlock {
	type?: string;
	attrs?: Record<string, unknown>;
	text?: string;
	marks?: { type: string }[];
	content?: JSONBlock[];
}

const docJSON = (editor: Editor) => editor.getJSON() as JSONBlock;

/**
 * Dispatch a real DOM keydown. `editor.commands.keyboardShortcut` is not a
 * substitute: Tiptap's shortcut command iterates `handleKeyDown` props and
 * stops at the first keymap that returns a defined value, so it never reaches
 * the Heading binding. The DOM event goes through ProseMirror's real pipeline.
 */
const pressEnter = (editor: Editor) => {
	editor.view.dom.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
	);
};

const blockTypes = (editor: Editor) =>
	editor
		.getJSON()
		.content?.map((block) =>
			block.type === 'heading' ? `heading-${block.attrs?.level}` : block.type
		);

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

describe('link mark boundaries', () => {
	it('keeps the link mark non-inclusive so typing cannot extend it (1/3)', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'https://example.com',
							marks: [{ type: 'link', attrs: { href: 'https://example.com' } }]
						}
					]
				}
			]
		});

		editor.commands.setTextSelection(editor.state.doc.nodeSize - 2);

		// Inclusive marks report active at the trailing boundary, which is what
		// makes typed characters (space included) join the mark.
		expect(editor.schema.marks.link.spec.inclusive).toBe(false);
		editor.destroy();
	});

	it('keeps the link mark non-inclusive so typing cannot extend it (2/3)', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'https://example.com',
							marks: [{ type: 'link', attrs: { href: 'https://example.com' } }]
						}
					]
				}
			]
		});

		editor.commands.setTextSelection(editor.state.doc.nodeSize - 2);
		expect(editor.isActive('link')).toBe(false);
		editor.destroy();
	});

	it('keeps the link mark non-inclusive so typing cannot extend it (3/3)', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'https://example.com',
							marks: [{ type: 'link', attrs: { href: 'https://example.com' } }]
						}
					]
				}
			]
		});

		editor.commands.setTextSelection(editor.state.doc.nodeSize - 2);
		expect(editor.state.storedMarks).toBeNull();
		editor.destroy();
	});

	it('still autolinks a URL without marking the following space (1/4)', () => {
		const editor = createEditor({ type: 'doc', content: [{ type: 'paragraph' }] });

		editor.commands.insertContent('https://example.com ');

		const [linked, _rest] = docJSON(editor).content?.[0]?.content ?? [];
		expect(linked?.text).toBe('https://example.com');
		editor.destroy();
	});

	it('still autolinks a URL without marking the following space (2/4)', () => {
		const editor = createEditor({ type: 'doc', content: [{ type: 'paragraph' }] });

		editor.commands.insertContent('https://example.com ');

		const [linked, _rest] = docJSON(editor).content?.[0]?.content ?? [];
		expect(linked?.marks?.some((mark) => mark.type === 'link')).toBe(true);
		editor.destroy();
	});

	it('still autolinks a URL without marking the following space (3/4)', () => {
		const editor = createEditor({ type: 'doc', content: [{ type: 'paragraph' }] });

		editor.commands.insertContent('https://example.com ');

		const [_linked, rest] = docJSON(editor).content?.[0]?.content ?? [];
		expect(rest?.text).toBe(' ');
		editor.destroy();
	});

	it('still autolinks a URL without marking the following space (4/4)', () => {
		const editor = createEditor({ type: 'doc', content: [{ type: 'paragraph' }] });

		editor.commands.insertContent('https://example.com ');

		const [_linked, rest] = docJSON(editor).content?.[0]?.content ?? [];
		expect(rest?.marks ?? []).toEqual([]);
		editor.destroy();
	});

	it('inserts unmarked text at the end boundary of a link (1/3)', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'https://example.com',
							marks: [{ type: 'link', attrs: { href: 'https://example.com' } }]
						}
					]
				}
			]
		});

		editor.commands.setTextSelection(editor.state.doc.nodeSize - 2);
		editor.commands.insertContent(' and more');

		const content = docJSON(editor).content?.[0]?.content ?? [];
		const _last = content.at(-1);
		expect(content).toHaveLength(2);
		editor.destroy();
	});

	it('inserts unmarked text at the end boundary of a link (2/3)', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'https://example.com',
							marks: [{ type: 'link', attrs: { href: 'https://example.com' } }]
						}
					]
				}
			]
		});

		editor.commands.setTextSelection(editor.state.doc.nodeSize - 2);
		editor.commands.insertContent(' and more');

		const content = docJSON(editor).content?.[0]?.content ?? [];
		const last = content.at(-1);
		expect(last?.text).toBe(' and more');
		editor.destroy();
	});

	it('inserts unmarked text at the end boundary of a link (3/3)', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'https://example.com',
							marks: [{ type: 'link', attrs: { href: 'https://example.com' } }]
						}
					]
				}
			]
		});

		editor.commands.setTextSelection(editor.state.doc.nodeSize - 2);
		editor.commands.insertContent(' and more');

		const content = docJSON(editor).content?.[0]?.content ?? [];
		const last = content.at(-1);
		expect(last?.marks ?? []).toEqual([]);
		editor.destroy();
	});
});

describe('heading Enter behaviour', () => {
	it('exits to a paragraph when Enter is pressed at the end of a heading (1/3)', () => {
		const editor = createEditor(headingDoc('Title'));
		editor.commands.setTextSelection(6); // end of "Title"

		pressEnter(editor);

		// The trailing paragraph is StarterKit's `trailingNode`, appended because
		// the document ends in a heading; Enter must add exactly one block.
		expect(blockTypes(editor)).toEqual(['heading-1', 'paragraph', 'paragraph']);
		editor.destroy();
	});

	it('exits to a paragraph when Enter is pressed at the end of a heading (2/3)', () => {
		const editor = createEditor(headingDoc('Title'));
		editor.commands.setTextSelection(6); // end of "Title"

		pressEnter(editor);
		// The heading node spans positions 0–7, so the caret must sit in the new
		// paragraph right after it (position 8), not in the trailing one.
		expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
		editor.destroy();
	});

	it('exits to a paragraph when Enter is pressed at the end of a heading (3/3)', () => {
		const editor = createEditor(headingDoc('Title'));
		editor.commands.setTextSelection(6); // end of "Title"

		pressEnter(editor);
		expect(editor.state.selection.from).toBe(8);
		editor.destroy();
	});

	it('turns the split tail into a paragraph when Enter is pressed mid-heading (1/3)', () => {
		const editor = createEditor(headingDoc('Hello World'));
		editor.commands.setTextSelection(7); // after "Hello "

		pressEnter(editor);

		expect(blockTypes(editor)).toEqual(['heading-1', 'paragraph', 'paragraph']);
		const [_heading, _tail] = docJSON(editor).content ?? [];
		editor.destroy();
	});

	it('turns the split tail into a paragraph when Enter is pressed mid-heading (2/3)', () => {
		const editor = createEditor(headingDoc('Hello World'));
		editor.commands.setTextSelection(7); // after "Hello "

		pressEnter(editor);
		const [heading, _tail] = docJSON(editor).content ?? [];
		expect(heading.content?.[0]?.text).toBe('Hello ');
		editor.destroy();
	});

	it('turns the split tail into a paragraph when Enter is pressed mid-heading (3/3)', () => {
		const editor = createEditor(headingDoc('Hello World'));
		editor.commands.setTextSelection(7); // after "Hello "

		pressEnter(editor);
		const [_heading, tail] = docJSON(editor).content ?? [];
		expect(tail.content?.[0]?.text).toBe('World');
		editor.destroy();
	});

	it('converts an empty heading in place instead of stacking another heading', () => {
		const editor = createEditor(headingDoc(''));
		editor.commands.setTextSelection(1);

		pressEnter(editor);

		expect(blockTypes(editor)).toEqual(['paragraph', 'paragraph']);
		editor.destroy();
	});
});

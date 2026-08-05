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
	content?: JSONBlock[];
}

const docJSON = (editor: Editor) => editor.getJSON() as JSONBlock;

/**
 * Dispatch a real DOM keydown, matching `extensions.spec.ts`: Tiptap's
 * `keyboardShortcut` stops at the first keymap that returns a defined value,
 * so only the DOM event reaches the Heading binding through ProseMirror.
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

const heading = (text: string) => ({
	type: 'heading',
	attrs: { level: 1 },
	content: [{ type: 'text', text }]
});

const mermaid = (source: string) => ({
	type: 'mermaid',
	content: [{ type: 'text', text: source }]
});

const table = () => ({
	type: 'table',
	content: [
		{
			type: 'tableRow',
			content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }]
		}
	]
});

const mermaidSource = 'graph LR\n  A --> B';

describe('heading Enter around heavy block nodes', () => {
	it('inserts a paragraph after a title that is followed by a mermaid node', () => {
		const editor = createEditor({
			type: 'doc',
			content: [heading('Title'), mermaid(mermaidSource)]
		});
		editor.commands.setTextSelection(7); // end of "Title"

		pressEnter(editor);

		// heading, new paragraph, mermaid, StarterKit's trailing paragraph.
		expect(blockTypes(editor)).toEqual(['heading-1', 'paragraph', 'mermaid', 'paragraph']);
		editor.destroy();
	});

	// Regression: the mermaid's source lives inside its node, so splitting the
	// heading must never reach into the diagram node and rewrite its text.
	it('leaves the mermaid source untouched when Enter is pressed at the end of the title', () => {
		const editor = createEditor({
			type: 'doc',
			content: [heading('Title'), mermaid(mermaidSource)]
		});
		editor.commands.setTextSelection(7);

		pressEnter(editor);

		const blocks = docJSON(editor).content ?? [];
		const diagram = blocks.find((block) => block.type === 'mermaid');
		expect(diagram?.content?.[0]?.text).toBe(mermaidSource);
		editor.destroy();
	});

	it('inserts a paragraph after a title that is followed by a table', () => {
		const editor = createEditor({ type: 'doc', content: [heading('Title'), table()] });
		editor.commands.setTextSelection(7);

		pressEnter(editor);

		expect(blockTypes(editor)).toEqual(['heading-1', 'paragraph', 'table', 'paragraph']);
		editor.destroy();
	});

	it('inserts a paragraph before a title that follows a mermaid node', () => {
		const editor = createEditor({
			type: 'doc',
			content: [mermaid(mermaidSource), heading('Title')]
		});
		// Start of the heading's content: the first character of "Title".
		editor.commands.setTextSelection(2 + mermaidSource.length + 1);

		pressEnter(editor);

		expect(blockTypes(editor)).toEqual(['mermaid', 'paragraph', 'heading-1', 'paragraph']);
		editor.destroy();
	});

	// Regression: the paragraph split off before the title must land between
	// the diagram and the heading, never inside the mermaid node.
	it('leaves the mermaid source untouched when Enter is pressed at the start of the title', () => {
		const editor = createEditor({
			type: 'doc',
			content: [mermaid(mermaidSource), heading('Title')]
		});
		editor.commands.setTextSelection(2 + mermaidSource.length + 1);

		pressEnter(editor);

		const blocks = docJSON(editor).content ?? [];
		const diagram = blocks.find((block) => block.type === 'mermaid');
		expect(diagram?.content?.[0]?.text).toBe(mermaidSource);
		editor.destroy();
	});
});

describe('heading spacing on document load', () => {
	// Regression: a note written by the agent can place a title directly above
	// a diagram or table; the editor must separate them without being asked.
	it('inserts a paragraph between a title and a following mermaid on load', () => {
		const editor = createEditor({ type: 'doc', content: [] });
		editor.commands.setContent({
			type: 'doc',
			content: [heading('Title'), mermaid(mermaidSource)]
		});

		expect(blockTypes(editor)).toEqual(['heading-1', 'paragraph', 'mermaid', 'paragraph']);
		editor.destroy();
	});

	it('inserts a paragraph between a title and a following table on load', () => {
		const editor = createEditor({ type: 'doc', content: [] });
		editor.commands.setContent({ type: 'doc', content: [heading('Title'), table()] });

		expect(blockTypes(editor)).toEqual(['heading-1', 'paragraph', 'table', 'paragraph']);
		editor.destroy();
	});

	it('keeps the mermaid source intact while spacing it from the title', () => {
		const editor = createEditor({ type: 'doc', content: [] });
		editor.commands.setContent({
			type: 'doc',
			content: [heading('Title'), mermaid(mermaidSource)]
		});

		const blocks = docJSON(editor).content ?? [];
		const diagram = blocks.find((block) => block.type === 'mermaid');
		expect(diagram?.content?.[0]?.text).toBe(mermaidSource);
		editor.destroy();
	});
});

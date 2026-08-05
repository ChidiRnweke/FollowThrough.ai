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

const bulletList = (items: string[]) => ({
	type: 'bulletList',
	content: items.map((text) => ({
		type: 'listItem',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	}))
});

const orderedList = (items: string[]) => ({
	type: 'orderedList',
	content: items.map((text) => ({
		type: 'listItem',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	}))
});

const mermaidSource = 'graph LR\n  A --> B';

const diagramTextOf = (editor: Editor): string | undefined =>
	docJSON(editor).content?.find((block) => block.type === 'mermaid')?.content?.[0]?.text;

/** The block that sits directly before the mermaid node. */
const blockBeforeMermaid = (editor: Editor): string | undefined => {
	const blocks = docJSON(editor).content ?? [];
	const mermaidIndex = blocks.findIndex((block) => block.type === 'mermaid');
	return mermaidIndex > 0 ? blocks[mermaidIndex - 1]?.type : undefined;
};

describe('heading spacing on load', () => {
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

	it('inserts a paragraph between a mermaid and a following title on load', () => {
		const editor = createEditor({ type: 'doc', content: [] });
		editor.commands.setContent({
			type: 'doc',
			content: [mermaid(mermaidSource), heading('Title')]
		});

		expect(blockTypes(editor)).toEqual(['mermaid', 'paragraph', 'heading-1', 'paragraph']);
		editor.destroy();
	});

	// Regression: the paragraph lands between the heading and the diagram, so
	// the diagram's source must be untouched by the spacing.
	it('keeps the mermaid source intact while spacing it from the title', () => {
		const editor = createEditor({ type: 'doc', content: [] });
		editor.commands.setContent({
			type: 'doc',
			content: [heading('Title'), mermaid(mermaidSource)]
		});

		expect(diagramTextOf(editor)).toBe(mermaidSource);
		editor.destroy();
	});

	it('spaces a diagram pasted after a title as well', () => {
		const editor = createEditor({
			type: 'doc',
			content: [heading('Title'), { type: 'paragraph' }]
		});
		editor.commands.insertContentAt(editor.state.doc.content.size, mermaid(mermaidSource));

		expect(blockBeforeMermaid(editor)).toBe('paragraph');
		editor.destroy();
	});
});

describe('heading Enter around block nodes', () => {
	// Regression: a split at the first character used to convert the title
	// itself into a paragraph, so there was no way to open an intro above it.
	it('inserts a paragraph before a title when Enter is pressed at its start', () => {
		const editor = createEditor({ type: 'doc', content: [heading('Title')] });
		editor.commands.setTextSelection(1); // start of "Title"

		pressEnter(editor);

		expect(blockTypes(editor)).toEqual(['paragraph', 'heading-1', 'paragraph']);
		editor.destroy();
	});

	// Regression: Enter at the end of a title that sits above a diagram must
	// leave a paragraph between them — the split may never reach into the
	// diagram's own node.
	it('leaves the mermaid source untouched when Enter is pressed at the end of the title', () => {
		const editor = createEditor({
			type: 'doc',
			content: [heading('Title'), mermaid(mermaidSource)]
		});
		editor.commands.setTextSelection(6); // end of "Title", inside the heading

		pressEnter(editor);

		expect(diagramTextOf(editor)).toBe(mermaidSource);
		editor.destroy();
	});

	it('keeps a paragraph between the title and a following mermaid after Enter', () => {
		const editor = createEditor({
			type: 'doc',
			content: [heading('Title'), mermaid(mermaidSource)]
		});
		editor.commands.setTextSelection(6);

		pressEnter(editor);

		expect(blockBeforeMermaid(editor)).toBe('paragraph');
		editor.destroy();
	});

	it('keeps a paragraph between the title and a following table after Enter', () => {
		const editor = createEditor({ type: 'doc', content: [heading('Title'), table()] });
		editor.commands.setTextSelection(6);

		pressEnter(editor);

		const blocks = docJSON(editor).content ?? [];
		const tableIndex = blocks.findIndex((block) => block.type === 'table');
		expect(blocks[tableIndex - 1]?.type).toBe('paragraph');
		editor.destroy();
	});

	// Regression: `splitBlock` used to fail outright when the block after the
	// title was a list, so a title above a bulleted list could not gain a blank
	// line below it.
	it('keeps a paragraph between the title and a following bulleted list after Enter', () => {
		const editor = createEditor({
			type: 'doc',
			content: [heading('Title'), bulletList(['one', 'two'])]
		});
		editor.commands.setTextSelection(6);

		pressEnter(editor);

		const blocks = docJSON(editor).content ?? [];
		const listIndex = blocks.findIndex((block) => block.type === 'bulletList');
		expect(blocks[listIndex - 1]?.type).toBe('paragraph');
		editor.destroy();
	});

	it('keeps a paragraph between the title and a following ordered list after Enter', () => {
		const editor = createEditor({
			type: 'doc',
			content: [heading('Title'), orderedList(['one', 'two'])]
		});
		editor.commands.setTextSelection(6);

		pressEnter(editor);

		const blocks = docJSON(editor).content ?? [];
		const listIndex = blocks.findIndex((block) => block.type === 'orderedList');
		expect(blocks[listIndex - 1]?.type).toBe('paragraph');
		editor.destroy();
	});

	it('leaves the mermaid source untouched when Enter is pressed mid-title', () => {
		const editor = createEditor({
			type: 'doc',
			content: [heading('Title'), mermaid(mermaidSource)]
		});
		editor.commands.setTextSelection(4);

		pressEnter(editor);

		expect(diagramTextOf(editor)).toBe(mermaidSource);
		editor.destroy();
	});
});

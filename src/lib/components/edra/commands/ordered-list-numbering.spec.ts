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

const orderedList = (items: string[], attrs: Record<string, unknown> = {}) => ({
	type: 'orderedList',
	...(Object.keys(attrs).length > 0 ? { attrs } : {}),
	content: items.map((text) => ({
		type: 'listItem',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	}))
});

const bulletList = (items: string[]) => ({
	type: 'bulletList',
	content: items.map((text) => ({
		type: 'listItem',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	}))
});

const paragraph = (text: string) => ({
	type: 'paragraph',
	...(text ? { content: [{ type: 'text', text }] } : {})
});

/** The list items of a block, as their first-line text. */
const itemTexts = (block: JSONBlock | undefined): string[] =>
	(block?.content ?? []).map((item) => item.content?.[0]?.content?.[0]?.text ?? '');

/** Every top-level ordered list's node range, in document order. */
const orderedListRanges = (editor: Editor): { from: number; to: number }[] => {
	const ranges: { from: number; to: number }[] = [];
	editor.state.doc.forEach((node, offset) => {
		if (node.type.name === 'orderedList') ranges.push({ from: offset, to: offset + node.nodeSize });
	});
	return ranges;
};

/** Every top-level paragraph's node range, in document order. */
const paragraphRanges = (editor: Editor): { from: number; to: number }[] => {
	const ranges: { from: number; to: number }[] = [];
	editor.state.doc.forEach((node, offset) => {
		if (node.type.name === 'paragraph') ranges.push({ from: offset, to: offset + node.nodeSize });
	});
	return ranges;
};

/** Range of the first list item inside the first ordered list. */
const firstListItemRange = (editor: Editor): { from: number; to: number } => {
	const list = editor.state.doc.content.firstChild;
	const item = list?.firstChild;
	return { from: 1, to: 1 + (item?.nodeSize ?? 0) };
};

describe('ordered list renumbering on item removal', () => {
	// Regression: deleting the first item of a list that starts above 1 left
	// the stale start in place, so the remaining items kept the old numbers.
	it('restarts a list at 1 when its first item is removed', () => {
		const editor = createEditor({
			type: 'doc',
			content: [orderedList(['c', 'd'], { start: 3 })]
		});
		const item = firstListItemRange(editor);
		editor.commands.deleteRange(item);

		expect(docJSON(editor).content?.[0]?.attrs?.start).toBe(1);
		editor.destroy();
	});

	it('keeps the surviving items of a renumbered list', () => {
		const editor = createEditor({
			type: 'doc',
			content: [orderedList(['c', 'd'], { start: 3 })]
		});
		editor.commands.deleteRange(firstListItemRange(editor));

		expect(itemTexts(docJSON(editor).content?.[0])).toEqual(['d']);
		editor.destroy();
	});

	it('leaves a list that already starts at 1 numbered at 1', () => {
		const editor = createEditor({
			type: 'doc',
			content: [orderedList(['a', 'b'])]
		});
		editor.commands.deleteRange(firstListItemRange(editor));

		expect(docJSON(editor).content?.[0]?.attrs?.start).toBe(1);
		editor.destroy();
	});
});

describe('ordered list merging', () => {
	// Regression: deleting the paragraph between two numbered lists left two
	// adjacent lists each numbering from its own start, so the sequence showed
	// 1..2 then 1..2 instead of one continuous 1..4.
	it('merges two lists left adjacent by a deletion into one list', () => {
		const editor = createEditor({
			type: 'doc',
			content: [orderedList(['a', 'b']), paragraph(''), orderedList(['c', 'd'])]
		});
		const separator = paragraphRanges(editor)[0];
		editor.commands.deleteRange(separator);

		expect(docJSON(editor).content?.filter((block) => block.type === 'orderedList')).toHaveLength(1);
		editor.destroy();
	});

	it('numbers the merged list continuously from 1', () => {
		const editor = createEditor({
			type: 'doc',
			content: [orderedList(['a', 'b']), paragraph(''), orderedList(['c', 'd'])]
		});
		const separator = paragraphRanges(editor)[0];
		editor.commands.deleteRange(separator);

		expect(itemTexts(blockOfType(editor, 'orderedList'))).toEqual(['a', 'b', 'c', 'd']);
		editor.destroy();
	});

	it('does not merge a numbered list with a bullet list', () => {
		const editor = createEditor({
			type: 'doc',
			content: [orderedList(['a']), paragraph(''), bulletList(['x'])]
		});
		const separator = paragraphRanges(editor)[0];
		editor.commands.deleteRange(separator);

		const types = (docJSON(editor).content ?? []).map((block) => block.type);
		expect(types.filter((type) => type === 'orderedList')).toHaveLength(1);
		editor.destroy();
	});

	it('does not merge lists with different marker styles', () => {
		const editor = createEditor({
			type: 'doc',
			content: [orderedList(['a'], { type: '1' }), paragraph(''), orderedList(['b'], { type: 'a' })]
		});
		const separator = paragraphRanges(editor)[0];
		editor.commands.deleteRange(separator);

		const types = (docJSON(editor).content ?? []).map((block) => block.type);
		expect(types.filter((type) => type === 'orderedList')).toHaveLength(2);
		editor.destroy();
	});
});

describe('ordered list numbering scoping', () => {
	// Regression: a deletion that does not touch a list must not silently reset
	// a deliberate non-1 start.
	it('leaves an untouched list that starts at 3 alone', () => {
		const editor = createEditor({
			type: 'doc',
			content: [paragraph('hello world'), orderedList(['c', 'd'], { start: 3 })]
		});
		editor.commands.deleteRange({ from: 1, to: 6 }); // "hello"

		expect(blockOfType(editor, 'orderedList')?.attrs?.start).toBe(3);
		editor.destroy();
	});
});

function blockOfType(editor: Editor, type: string): JSONBlock | undefined {
	return (docJSON(editor).content ?? []).find((block) => block.type === type);
}

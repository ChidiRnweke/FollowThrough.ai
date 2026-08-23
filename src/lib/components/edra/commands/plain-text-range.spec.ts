// @vitest-environment jsdom

import { Editor, getTextBetween, getTextSerializersFromSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { noteMarkdownExtensions } from './markdown-extensions';
import { plainTextRangeToPm, type PmTextRange } from './plain-text-range';

const createEditor = (content: Record<string, unknown>) =>
	new Editor({
		element: document.createElement('div'),
		extensions: noteMarkdownExtensions,
		content
	});

const plainTextOf = (editor: Editor) => editor.getText({ blockSeparator: '\n\n' });

/** Extracts a mapped range with the same serialization the mapper searched against. */
const extract = (editor: Editor, range: PmTextRange): string =>
	getTextBetween(
		editor.state.doc,
		{ from: range.from, to: range.to },
		{
			blockSeparator: '\n\n',
			textSerializers: getTextSerializersFromSchema(editor.schema)
		}
	);

const paragraph = (text: string) => ({
	type: 'paragraph',
	content: [{ type: 'text', text }]
});

describe('Mapping plain-text ranges to ProseMirror positions', () => {
	it('maps a range inside a single paragraph', () => {
		const editor = createEditor({ type: 'doc', content: [paragraph('alpha')] });
		const range = plainTextRangeToPm(editor, 2, 5);
		expect(range && extract(editor, range)).toBe('pha');
	});

	it('maps a range that crosses the block separator', () => {
		const editor = createEditor({
			type: 'doc',
			content: [paragraph('alpha'), paragraph('beta gamma')]
		});
		const plain = plainTextOf(editor);
		const start = plain.indexOf('ha');
		const end = plain.indexOf('bet') + 3;
		const range = plainTextRangeToPm(editor, start, end);
		expect(range && extract(editor, range)).toBe(plain.slice(start, end));
	});

	it('maps a range inside a nested list item', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'bulletList',
					content: [
						{ type: 'listItem', content: [paragraph('item one')] },
						{ type: 'listItem', content: [paragraph('item two')] }
					]
				}
			]
		});
		const plain = plainTextOf(editor);
		const start = plain.indexOf('two');
		const range = plainTextRangeToPm(editor, start, start + 3);
		expect(range && extract(editor, range)).toBe('two');
	});

	it('maps a range after a hard break', () => {
		const editor = createEditor({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'line' },
						{ type: 'hardBreak' },
						{ type: 'text', text: 'next' }
					]
				}
			]
		});
		const plain = plainTextOf(editor);
		const start = plain.indexOf('next');
		const range = plainTextRangeToPm(editor, start, start + 4);
		expect(range && extract(editor, range)).toBe('next');
	});

	it('rejects a range the document text cannot contain', () => {
		const editor = createEditor({ type: 'doc', content: [paragraph('short')] });
		expect(plainTextRangeToPm(editor, 0, 999)).toBeUndefined();
	});

	it('rejects an empty range', () => {
		const editor = createEditor({ type: 'doc', content: [paragraph('short')] });
		expect(plainTextRangeToPm(editor, 3, 3)).toBeUndefined();
	});
});

import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { withoutClipboardPadding } from './paste-slice';
import { noteMarkdownExtensions } from './markdown-extensions';

/**
 * Copying a paragraph that ends in line breaks used to carry `<br><br>` onto the
 * clipboard, and pasting merged them into the paragraph at the caret — a blank line above
 * and below the text, and one more on every round of copy and paste.
 */
const schema = getSchema(noteMarkdownExtensions);

const text = (value: string): ProseMirrorNode =>
	schema.nodes.paragraph.create(null, schema.text(value));
const blank = (): ProseMirrorNode => schema.nodes.paragraph.create();
const rule = (): ProseMirrorNode => schema.nodes.horizontalRule.create();
const br = (): ProseMirrorNode => schema.nodes.hardBreak.create();
const para = (...kids: ProseMirrorNode[]): ProseMirrorNode =>
	schema.nodes.paragraph.create(null, kids);

const sliceOf = (children: ProseMirrorNode[], openStart = 0, openEnd = 0): Slice =>
	new Slice(Fragment.fromArray(children), openStart, openEnd);

const names = (slice: Slice): string[] => {
	const collected: string[] = [];
	slice.content.forEach((child) => collected.push(child.textContent || child.type.name));
	return collected;
};
const kinds = (node: ProseMirrorNode): string[] => {
	const collected: string[] = [];
	node.content.forEach((child) => collected.push(child.type.name));
	return collected;
};

describe('Trimming line breaks off the edges of a copied block', () => {
	it('drops the trailing breaks a paragraph carries', () => {
		const trimmed = withoutClipboardPadding(sliceOf([para(schema.text('A'), br(), br())], 1, 1));

		expect(kinds(trimmed.content.child(0))).toEqual(['text']);
	});

	it('drops the leading breaks a paragraph carries', () => {
		const trimmed = withoutClipboardPadding(sliceOf([para(br(), schema.text('A'))], 1, 1));

		expect(kinds(trimmed.content.child(0))).toEqual(['text']);
	});

	it('keeps a line break the author put between two runs of text', () => {
		const authored = para(schema.text('one'), br(), schema.text('two'));

		expect(names(withoutClipboardPadding(sliceOf([authored])))).toEqual([
			'one',
			'hardBreak',
			'two'
		]);
	});

	it('leaves a line break inside a code block alone', () => {
		const source = schema.nodes.codeBlock.create(null, [schema.text('const a = 1;'), br()]);

		expect(kinds(withoutClipboardPadding(sliceOf([source])).content.child(0))).toEqual([
			'text',
			'hardBreak'
		]);
	});

	it('reaches a paragraph nested inside a list item', () => {
		const item = schema.nodes.listItem.create(null, para(schema.text('A'), br()));
		const list = schema.nodes.bulletList.create(null, item);

		expect(
			kinds(
				withoutClipboardPadding(sliceOf([list]))
					.content.child(0)
					.child(0)
					.child(0)
			)
		).toEqual(['text']);
	});

	it('reduces a paragraph of nothing but breaks to a single blank line', () => {
		const padding = para(br(), br());

		expect(
			withoutClipboardPadding(sliceOf([text('A'), padding, text('B')])).content.child(1).content
				.size
		).toBe(0);
	});
});

describe('Trimming blank blocks off the edges of a pasted slice', () => {
	it('drops a leading blank paragraph', () => {
		expect(names(withoutClipboardPadding(sliceOf([blank(), text('A')])))).toEqual(['A']);
	});

	it('drops a trailing blank paragraph', () => {
		expect(names(withoutClipboardPadding(sliceOf([text('A'), blank()])))).toEqual(['A']);
	});

	it('drops blank paragraphs at both ends', () => {
		expect(
			names(withoutClipboardPadding(sliceOf([blank(), text('A'), text('B'), blank()])))
		).toEqual(['A', 'B']);
	});

	it('drops a paragraph left empty by its own trailing breaks', () => {
		expect(names(withoutClipboardPadding(sliceOf([text('A'), para(br(), br())])))).toEqual(['A']);
	});

	it('keeps a blank paragraph between two blocks of content', () => {
		expect(names(withoutClipboardPadding(sliceOf([text('A'), blank(), text('B')])))).toEqual([
			'A',
			'paragraph',
			'B'
		]);
	});

	it('returns a slice with no padding unchanged', () => {
		const slice = sliceOf([text('A'), text('B')]);

		expect(withoutClipboardPadding(slice)).toBe(slice);
	});

	it('keeps an empty code block, whose emptiness is the content', () => {
		expect(
			names(withoutClipboardPadding(sliceOf([schema.nodes.codeBlock.create(), text('A')])))
		).toEqual(['codeBlock', 'A']);
	});

	it('keeps a block that is empty but not a textblock', () => {
		expect(names(withoutClipboardPadding(sliceOf([rule(), text('A')])))).toEqual([
			'horizontalRule',
			'A'
		]);
	});
});

describe('Merging a copied paragraph rather than splitting the one at the caret', () => {
	it('hands a lone closed paragraph back as inline content', () => {
		const merged = withoutClipboardPadding(sliceOf([text('Frontend ')]));

		expect(merged.content.firstChild?.type.name).toBe('text');
	});

	it('does the same once the padding around it is stripped', () => {
		const padded = sliceOf([para(br(), br()), text('Frontend '), para(br(), br())]);

		expect(withoutClipboardPadding(padded).content.firstChild?.type.name).toBe('text');
	});

	it('leaves a heading a block, so it does not dissolve into the caret', () => {
		const heading = schema.nodes.heading.create({ level: 2 }, schema.text('Frontend'));

		expect(withoutClipboardPadding(sliceOf([heading])).content.firstChild?.type.name).toBe(
			'heading'
		);
	});

	it('leaves several blocks alone', () => {
		expect(withoutClipboardPadding(sliceOf([text('A'), text('B')])).content.childCount).toBe(2);
	});

	it('leaves an already-open paragraph alone, since it merges on its own', () => {
		expect(withoutClipboardPadding(sliceOf([text('A')], 1, 1)).content.firstChild?.type.name).toBe(
			'paragraph'
		);
	});
});

describe('Where the open boundary goes when its blank block is removed', () => {
	it('hands an open start to the paragraph behind it, so the text still merges', () => {
		expect(withoutClipboardPadding(sliceOf([blank(), text('A')], 1, 0)).openStart).toBe(1);
	});

	it('hands an open end to the paragraph in front of it', () => {
		expect(withoutClipboardPadding(sliceOf([text('A'), blank()], 0, 1)).openEnd).toBe(1);
	});

	it('closes the boundary when the block behind it could not have merged', () => {
		expect(withoutClipboardPadding(sliceOf([blank(), rule(), text('A')], 1, 0)).openStart).toBe(0);
	});

	it('leaves a closed boundary closed', () => {
		expect(withoutClipboardPadding(sliceOf([blank(), text('A')])).openStart).toBe(0);
	});
});

import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { withoutBoundaryBlankBlocks } from './paste-slice';
import { noteMarkdownExtensions } from './markdown-extensions';

/**
 * Pasting used to leave a blank line above or below the text, depending on where the
 * clipboard came from: a web page contributes a trailing empty paragraph, a selection
 * dragged past the end of a paragraph contributes one at each end.
 */
const schema = getSchema(noteMarkdownExtensions);

const text = (value: string): ProseMirrorNode =>
	schema.nodes.paragraph.create(null, schema.text(value));
const blank = (): ProseMirrorNode => schema.nodes.paragraph.create();
const rule = (): ProseMirrorNode => schema.nodes.horizontalRule.create();
const code = (): ProseMirrorNode => schema.nodes.codeBlock.create();
/** How a web page writes a blank line: `<p><br></p>`. */
const lineBreak = (): ProseMirrorNode =>
	schema.nodes.paragraph.create(null, schema.nodes.hardBreak.create());

const sliceOf = (children: ProseMirrorNode[], openStart = 0, openEnd = 0): Slice =>
	new Slice(Fragment.fromArray(children), openStart, openEnd);

const names = (slice: Slice): string[] => {
	const collected: string[] = [];
	slice.content.forEach((child) => collected.push(child.textContent || child.type.name));
	return collected;
};

describe('Trimming blank blocks off a pasted slice', () => {
	it('drops a leading blank paragraph', () => {
		expect(names(withoutBoundaryBlankBlocks(sliceOf([blank(), text('A')])))).toEqual(['A']);
	});

	it('drops a trailing blank paragraph', () => {
		expect(names(withoutBoundaryBlankBlocks(sliceOf([text('A'), blank()])))).toEqual(['A']);
	});

	it('drops blank paragraphs at both ends', () => {
		expect(
			names(withoutBoundaryBlankBlocks(sliceOf([blank(), text('A'), text('B'), blank()])))
		).toEqual(['A', 'B']);
	});

	it('drops a run of blank paragraphs on one end', () => {
		expect(names(withoutBoundaryBlankBlocks(sliceOf([text('A'), blank(), blank()])))).toEqual([
			'A'
		]);
	});

	it('keeps a blank paragraph between two blocks of content', () => {
		expect(names(withoutBoundaryBlankBlocks(sliceOf([text('A'), blank(), text('B')])))).toEqual([
			'A',
			'paragraph',
			'B'
		]);
	});

	it('returns a slice with no blank edges unchanged', () => {
		const slice = sliceOf([text('A'), text('B')]);

		expect(withoutBoundaryBlankBlocks(slice)).toBe(slice);
	});

	it('returns a slice that is blank throughout unchanged', () => {
		const slice = sliceOf([blank(), blank()]);

		expect(withoutBoundaryBlankBlocks(slice)).toBe(slice);
	});

	it('drops a trailing paragraph that holds only a line break', () => {
		expect(names(withoutBoundaryBlankBlocks(sliceOf([text('A'), lineBreak()])))).toEqual(['A']);
	});

	it('keeps a paragraph whose line break follows real text', () => {
		const withBreak = schema.nodes.paragraph.create(null, [
			schema.text('A'),
			schema.nodes.hardBreak.create()
		]);

		expect(withoutBoundaryBlankBlocks(sliceOf([text('B'), withBreak])).content.childCount).toBe(2);
	});

	it('keeps an empty code block, whose emptiness is the content', () => {
		expect(names(withoutBoundaryBlankBlocks(sliceOf([code(), text('A')])))).toEqual([
			'codeBlock',
			'A'
		]);
	});

	it('keeps a block that is empty but not a textblock', () => {
		expect(names(withoutBoundaryBlankBlocks(sliceOf([rule(), text('A')])))).toEqual([
			'horizontalRule',
			'A'
		]);
	});
});

describe('Where the open boundary goes when its blank block is removed', () => {
	it('hands an open start to the paragraph behind it, so the text still merges', () => {
		expect(withoutBoundaryBlankBlocks(sliceOf([blank(), text('A')], 1, 0)).openStart).toBe(1);
	});

	it('hands an open end to the paragraph in front of it', () => {
		expect(withoutBoundaryBlankBlocks(sliceOf([text('A'), blank()], 0, 1)).openEnd).toBe(1);
	});

	it('closes the boundary when the block behind it could not have merged', () => {
		expect(withoutBoundaryBlankBlocks(sliceOf([blank(), rule(), text('A')], 1, 0)).openStart).toBe(
			0
		);
	});

	it('leaves a closed boundary closed', () => {
		expect(withoutBoundaryBlankBlocks(sliceOf([blank(), text('A')])).openStart).toBe(0);
	});
});

import { describe, expect, it } from 'vitest';
import {
	changedTopLevelBlockIndices,
	type ShimmerDocument,
	type ShimmerNode
} from './note-shimmer';

const para = (text: string): ShimmerNode => ({
	type: 'paragraph',
	content: [{ type: 'text', text }]
});
const heading = (text: string): ShimmerNode => ({
	type: 'heading',
	attrs: { level: 2 },
	content: [{ type: 'text', text }]
});
const doc = (...content: ShimmerNode[]): ShimmerDocument => ({ type: 'doc', content });

describe('changedTopLevelBlockIndices', () => {
	it('reports nothing for two identical documents', () => {
		const note = doc(para('one'), para('two'));

		expect(changedTopLevelBlockIndices(note, note)).toEqual([]);
	});

	it('reports only the paragraph whose text changed', () => {
		const before = doc(para('one'), para('two'));
		const after = doc(para('one'), para('two, edited'));

		expect(changedTopLevelBlockIndices(before, after)).toEqual([1]);
	});

	it('reports a block appended at the end', () => {
		const before = doc(para('one'));
		const after = doc(para('one'), para('new block'));

		expect(changedTopLevelBlockIndices(before, after)).toEqual([1]);
	});

	it('reports a block inserted in the middle and those that follow it', () => {
		const before = doc(para('one'), para('two'));
		const after = doc(para('one'), para('inserted'), para('two'));

		expect(changedTopLevelBlockIndices(before, after)).toEqual([1, 2]);
	});

	it('reports a heading whose text changed', () => {
		const before = doc(para('one'), heading('Extraction'));
		const after = doc(para('one'), heading('Extraction and follow-through'));

		expect(changedTopLevelBlockIndices(before, after)).toEqual([1]);
	});

	it('reports every block for a full rewrite', () => {
		const before = doc(para('one'), para('two'), heading('Three'));
		const after = doc(para('alpha'), para('beta'));

		expect(changedTopLevelBlockIndices(before, after)).toEqual([0, 1]);
	});

	it('ignores structural noise when the text is unchanged', () => {
		const before = doc({ type: 'paragraph', content: [{ type: 'text', text: 'same' }] });
		const after = doc({
			type: 'paragraph',
			attrs: { textAlign: null },
			content: [{ type: 'text', text: 'same' }]
		});

		expect(changedTopLevelBlockIndices(before, after)).toEqual([]);
	});

	it('ignores mark-only changes inside a block', () => {
		const before = doc(para('same'));
		const after = doc({
			type: 'paragraph',
			content: [{ type: 'text', text: 'same', marks: [{ type: 'bold' }] }]
		});

		expect(changedTopLevelBlockIndices(before, after)).toEqual([]);
	});

	it('handles documents with no blocks', () => {
		const empty = doc();

		expect(changedTopLevelBlockIndices(empty, empty)).toEqual([]);
	});
});

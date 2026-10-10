import { describe, expect, it } from 'vitest';
import { EmbeddingBatching } from './embedding-batching';

const batching = new EmbeddingBatching({ count: (text) => text.length });

describe('embedding request budgets', () => {
	it('makes no batch for empty input', () => {
		expect([...batching.batches([])]).toEqual([]);
	});
	it('keeps an exact-budget request together', () => {
		const contents = ['a'.repeat(15_000), 'b'.repeat(15_000)];
		expect([...batching.batches(contents)]).toEqual([contents]);
	});
	it('starts the next request only above the budget', () => {
		const contents = ['a'.repeat(15_000), 'b'.repeat(15_001), 'c'];
		expect([...batching.batches(contents)]).toEqual([[contents[0]], [contents[1], contents[2]]]);
	});
	it('keeps oversized inputs whole and preserves surrounding input order', () => {
		const contents = ['first', 'b'.repeat(30_001), 'last'];
		expect([...batching.batches(contents)]).toEqual(contents.map((content) => [content]));
	});
	it('retains empty strings within a nonempty request', () => {
		expect([...batching.batches(['', 'a', ''])]).toEqual([['', 'a', '']]);
	});
});

it('preserves returned model labels for owning completion validation', () => {
	expect(batching.combine('requested', [{ model: 'different', vectors: [[1]] }])).toEqual({
		model: 'different',
		vectors: [[1]]
	});
});

it('rejects a model change between batches instead of relabeling vectors', () => {
	expect(() =>
		batching.combine('first', [
			{ model: 'first', vectors: [[1]] },
			{ model: 'second', vectors: [[2]] }
		])
	).toThrow('Embedding batches returned different models');
});

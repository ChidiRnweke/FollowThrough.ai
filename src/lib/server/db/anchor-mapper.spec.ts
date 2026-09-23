import { expect, it } from 'vitest';
import { toAnchor } from './mappers';

const row = (
	fromOffset: number | null,
	toOffset: number | null
): Parameters<typeof toAnchor>[0] => ({
	id: '10000000-0000-4000-8000-000000000001',
	noteId: '20000000-0000-4000-8000-000000000002',
	nodeId: null,
	fromOffset,
	toOffset,
	quote: 'Send',
	prefix: null,
	suffix: null,
	revision: 1,
	createdAt: new Date('2026-09-23T10:00:00.000Z')
});

it.each([
	[0, null],
	[null, 4],
	[-1, 4],
	[4, 0]
])('refuses an invalid stored anchor range: %s to %s', (from, to) => {
	expect(() => toAnchor(row(from, to))).toThrow();
});

it('preserves a complete stored range', () => {
	const anchor = toAnchor(row(0, 4));
	expect({ from: anchor.from, to: anchor.to }).toEqual({ from: 0, to: 4 });
});

it('retains a quote without recorded offsets', () => {
	const anchor = toAnchor(row(null, null));
	expect({ from: anchor.from, to: anchor.to, quote: anchor.quote }).toEqual({
		from: undefined,
		to: undefined,
		quote: 'Send'
	});
});

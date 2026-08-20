import { describe, expect, it } from 'vitest';
import { countWords, readingMinutes } from './reading-time';

describe('Estimating how long a note takes to read', () => {
	it('has no reading time for an empty note', () => {
		expect(readingMinutes(0)).toBe(0);
	});

	it('rounds a short note up to a minute rather than to nothing', () => {
		expect(readingMinutes(12)).toBe(1);
	});

	it('rounds a part-finished minute up', () => {
		expect(readingMinutes(450 + 1)).toBe(3);
	});

	it('counts whole minutes for a long note', () => {
		expect(readingMinutes(450)).toBe(2);
	});

	it('treats a negative count as empty', () => {
		expect(readingMinutes(-5)).toBe(0);
	});
});

describe('Counting the words in a passage', () => {
	it('counts nothing in an empty passage', () => {
		expect(countWords('')).toBe(0);
	});

	it('counts nothing in a passage that is only whitespace', () => {
		expect(countWords('  \n\n\t ')).toBe(0);
	});

	it('counts a single word', () => {
		expect(countWords('ship')).toBe(1);
	});

	it('ignores the whitespace around a passage', () => {
		expect(countWords('  ship it  ')).toBe(2);
	});

	it('counts across the block separator a note plain-texts with', () => {
		expect(countWords('first block\n\nsecond block')).toBe(4);
	});

	it('counts a punctuated clause by its whitespace runs', () => {
		expect(countWords('We agreed: ship it, then review.')).toBe(6);
	});
});

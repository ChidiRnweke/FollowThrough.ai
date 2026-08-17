import { describe, expect, it } from 'vitest';
import { readingMinutes } from './reading-time';

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

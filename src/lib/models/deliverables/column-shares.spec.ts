import { describe, expect, it } from 'vitest';
import { columnShares } from './index';

describe('columnShares', () => {
	it('divides the declared widths into shares of one', () => {
		expect(columnShares([[60], [20], [20]], 3)).toEqual([0.6, 0.2, 0.2]);
	});

	// Regression: both renderers held "every column has a width" and "there is a
	// total to divide by" as two values, and then re-asserted the first with
	// `(w as number)` inside a `map` the guard's narrowing did not reach.
	it('declines when one column declares no width', () => {
		expect(columnShares([[60], undefined, [20]], 3)).toBeUndefined();
	});

	it('declines when the editor stored a null colwidth', () => {
		expect(columnShares([[60], null], 2)).toBeUndefined();
	});

	it('declines when fewer columns are declared than the row has', () => {
		expect(columnShares([[60], [40]], 3)).toBeUndefined();
	});

	// A zero-width column would make the total smaller than the sum the renderer
	// lays out against, and a negative one would invert a column.
	it('declines a width of zero', () => {
		expect(columnShares([[60], [0]], 2)).toBeUndefined();
	});

	it('declines a width that is not finite', () => {
		expect(columnShares([[60], [Number.NaN]], 2)).toBeUndefined();
	});

	it('declines an empty colwidth array, which declares no width at all', () => {
		expect(columnShares([[60], []], 2)).toBeUndefined();
	});
});

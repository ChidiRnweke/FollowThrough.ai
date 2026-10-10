import { describe, expect, it } from 'vitest';
import { ExportPreparationService } from './export-preparation';
import type { ProseMirrorTableNode } from '$lib/models/notes';
const preparation = new ExportPreparationService();
const preparedShares = (widths: readonly (readonly number[] | null | undefined)[]) => {
	const table: ProseMirrorTableNode = {
		type: 'table',
		content: [
			{
				type: 'tableRow',
				content: widths.map((colwidth) => ({
					type: 'tableCell',
					attrs: colwidth === undefined ? {} : { colwidth },
					content: [{ type: 'paragraph' }]
				}))
			}
		]
	};
	return preparation
		.prepare({
			title: 'Table',
			notes: [{ title: 'Note', document: { type: 'doc', content: [table] } }]
		})
		.nodes.get(table)?.columnShares;
};

describe('columnShares', () => {
	it('preserves relative widths when their finite values overflow the sum', () => {
		expect(preparedShares([[1e308], [1e308]])).toEqual([0.5, 0.5]);
	});

	it('divides the declared widths into shares of one', () => {
		expect(preparedShares([[60], [20], [20]])).toEqual([0.6, 0.2, 0.2]);
	});

	// Regression: both renderers held "every column has a width" and "there is a
	// total to divide by" as two values, and then re-asserted the first with
	// `(w as number)` inside a `map` the guard's narrowing did not reach.
	it('declines when one column declares no width', () => {
		expect(preparedShares([[60], undefined, [20]])).toBeUndefined();
	});

	it('declines when the editor stored a null colwidth', () => {
		expect(preparedShares([[60], null])).toBeUndefined();
	});

	// A zero-width column would make the total smaller than the sum the renderer
	// lays out against, and a negative one would invert a column.
	it('declines a width of zero', () => {
		expect(preparedShares([[60], [0]])).toBeUndefined();
	});

	it('declines an empty colwidth array, which declares no width at all', () => {
		expect(preparedShares([[60], []])).toBeUndefined();
	});
});

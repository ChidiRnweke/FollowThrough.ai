import { describe, expect, it } from 'vitest';
import type { WidgetDataTableColumn } from '$lib/models/widgets';
import { emptyRow, typedNumber, withCell, withoutRow } from './data-table-rows';

const columns: WidgetDataTableColumn[] = [
	{ key: 'item', label: 'Item', kind: 'text' },
	{ key: 'amount', label: 'Amount', kind: 'number' },
	{ key: 'paid', label: 'Paid', kind: 'checkbox' },
	{
		key: 'category',
		label: 'Category',
		kind: 'select',
		options: [
			{ value: 'food', label: 'Food' },
			{ value: 'rent', label: 'Rent' }
		]
	}
];

describe('data table rows', () => {
	it('starts a new row with the empty value of each column kind', () => {
		expect(emptyRow(columns)).toEqual({ item: '', amount: 0, paid: false, category: 'food' });
	});
	it('changes one cell and keeps every other row as it was', () => {
		const rows = [{ amount: 1 }, { amount: 2 }];
		expect(withCell(rows, 1, 'amount', 5)[0]).toBe(rows[0]);
	});
	it('removes the row at an index', () => {
		expect(withoutRow([{ n: 1 }, { n: 2 }, { n: 3 }], 1)).toEqual([{ n: 1 }, { n: 3 }]);
	});
	it('reads an emptied number field as no number yet', () => {
		expect(typedNumber('  ')).toBeUndefined();
	});
});

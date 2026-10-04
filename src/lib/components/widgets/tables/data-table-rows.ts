import type { JsonValue, WidgetDataTableColumn } from '$lib/models/widgets';

export type DataTableRow = { readonly [key: string]: JsonValue };

/** What a new row holds in each column: the empty value of the column's kind. */
const emptyCell = (column: WidgetDataTableColumn): JsonValue => {
	switch (column.kind) {
		case 'text':
			return '';
		case 'number':
			return 0;
		case 'checkbox':
			return false;
		case 'select':
			return column.options[0]!.value;
	}
};

export const emptyRow = (columns: readonly WidgetDataTableColumn[]): DataTableRow =>
	Object.fromEntries(columns.map((column) => [column.key, emptyCell(column)]));

/** The rows with one cell changed. Every other row is the same value, so the diff is that cell. */
export const withCell = (
	rows: readonly DataTableRow[],
	index: number,
	key: string,
	value: JsonValue
): readonly DataTableRow[] =>
	rows.map((row, at) => (at === index ? { ...row, [key]: value } : row));

export const withoutRow = (rows: readonly DataTableRow[], index: number): readonly DataTableRow[] =>
	rows.filter((_, at) => at !== index);

/** A typed number, or undefined while the field is empty or not yet a number. */
export const typedNumber = (raw: string): number | undefined => {
	const parsed = Number(raw);
	return raw.trim() !== '' && Number.isFinite(parsed) ? parsed : undefined;
};

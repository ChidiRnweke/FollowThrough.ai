import { WidgetExportService } from '$lib/services/widgets/export-blocks';
const widgetExporting = new WidgetExportService();
import { describe, expect, it } from 'vitest';
import { widgetTemplates } from '$lib/models/widgets';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import type { Widget } from '$lib/models/widgets';

/** These widgets have no formulas, so their saved data is the state they render. */
const exported = (widget: Widget) => widgetExporting.prepare(widget, widget.data);

describe('widget export', () => {
	it('writes a checklist as a heading and one check per item', () => {
		const ticked = widgetBuilder({
			data: {
				...widgetTemplates.checklist.data,
				items: [
					{ id: 'a', label: 'Ship', done: true },
					{ id: 'b', label: 'Tell support', done: false }
				]
			}
		});
		expect(exported(ticked).blocks).toEqual([
			{ kind: 'heading', text: 'Checklist', level: 3 },
			{ kind: 'check', label: 'Ship', checked: true },
			{ kind: 'check', label: 'Tell support', checked: false }
		]);
	});
	it('writes each status row on one line, with its flag only where the rule holds', () => {
		const status = exported(
			widgetBuilder({ layout: widgetTemplates.status.layout, data: widgetTemplates.status.data })
		).blocks;
		expect(status.slice(1)).toEqual([
			{ kind: 'paragraph', text: 'Design · On track', muted: false },
			{ kind: 'paragraph', text: 'Build · At risk', muted: false },
			{ kind: 'paragraph', text: 'Launch · Blocked · [Needs attention]', muted: false }
		]);
	});
	it('writes a table from its rows under its column labels', () => {
		const table = exported(
			widgetBuilder({
				layout: widgetTemplates.decisions.layout,
				data: widgetTemplates.decisions.data
			})
		).blocks.find((block) => block.kind === 'table');
		expect(table).toEqual({
			kind: 'table',
			columns: ['Decision', 'Owner', 'Date'],
			rows: [['First decision', 'Owner', '2026-10-01']]
		});
	});
	it('names an element the catalog no longer has instead of dropping it', () => {
		expect(
			exported(
				widgetBuilder({
					layout: { root: 'g', elements: { g: { type: 'Gauge', props: {}, children: [] } } }
				})
			).blocks
		).toEqual([{ kind: 'unsupported', type: 'Gauge' }]);
	});
	it('writes a value a formula worked out, from the state it is given', () => {
		const widget = widgetBuilder({
			layout: {
				root: 'total',
				elements: {
					total: {
						type: 'Metric',
						props: { label: 'Total', value: { $state: '/derived/total' } },
						children: []
					}
				},
				derived: { total: '@/a + @/b' }
			},
			data: { a: 1, b: 2 }
		});
		expect(
			widgetExporting.prepare(widget, { ...widget.data, derived: { total: 3 } }).blocks
		).toEqual([{ kind: 'metric', label: 'Total', value: '3' }]);
	});
	it('prints a chart as the table of what it plots, under its title', () => {
		const widget = widgetBuilder({
			layout: {
				root: 'chart',
				elements: {
					chart: {
						type: 'LineChart',
						props: {
							title: 'Balance',
							rows: { $state: '/rows' },
							x: 'year',
							series: [{ key: 'balance', label: 'Balance' }]
						},
						children: []
					}
				}
			},
			data: {
				rows: [
					{ year: 0, balance: 100 },
					{ year: 1, balance: 105 }
				]
			}
		});
		expect(exported(widget).blocks).toEqual([
			{ kind: 'paragraph', text: 'Balance', muted: true },
			{
				kind: 'table',
				columns: ['year', 'Balance'],
				rows: [
					['0', '100'],
					['1', '105']
				]
			}
		]);
	});
	it('prints an editable table with ticks, option labels and its footer', () => {
		const { layout, data } = widgetTemplates.expenses;
		const table = widgetExporting
			.prepare(widgetBuilder({ layout, data }), {
				...data,
				derived: { totals: { item: 'Total', amount: '1,446.50' } }
			})
			.blocks.find((block) => block.kind === 'table');
		expect(table).toEqual({
			kind: 'table',
			columns: ['Item', 'Category', 'Amount', 'Paid'],
			rows: [
				['Rent', 'Housing', '1200', '☑'],
				['Groceries', 'Food', '182.5', '☑'],
				['Train pass', 'Transport', '64', '☐'],
				['Total', '', '1,446.50', '']
			]
		});
	});
	it('prints a row of inputs with their labels, and a slider with its suffix', () => {
		const { layout, data } = widgetTemplates.savings;
		const blocks = widgetExporting.prepare(widgetBuilder({ layout, data }), data).blocks;
		expect(blocks.slice(1, 4)).toEqual([
			{ kind: 'paragraph', text: 'Starting amount: 10000 · Monthly deposit: 250', muted: false },
			{ kind: 'field', label: 'Yearly interest', value: '5%' },
			{ kind: 'field', label: 'Years', value: '20' }
		]);
	});
});

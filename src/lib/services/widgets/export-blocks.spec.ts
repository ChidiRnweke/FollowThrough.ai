import { describe, expect, it } from 'vitest';
import { widgetTemplates } from '$lib/models/widgets';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import { widgetExport } from './export-blocks';

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
		expect(widgetExport(ticked).blocks).toEqual([
			{ kind: 'heading', text: 'Checklist', level: 3 },
			{ kind: 'check', label: 'Ship', checked: true },
			{ kind: 'check', label: 'Tell support', checked: false }
		]);
	});
	it('writes each status row on one line, with its flag only where the rule holds', () => {
		const status = widgetExport(
			widgetBuilder({ layout: widgetTemplates.status.layout, data: widgetTemplates.status.data })
		).blocks;
		expect(status.slice(1)).toEqual([
			{ kind: 'paragraph', text: 'Design · On track', muted: false },
			{ kind: 'paragraph', text: 'Build · At risk', muted: false },
			{ kind: 'paragraph', text: 'Launch · Blocked · [Needs attention]', muted: false }
		]);
	});
	it('writes a table from its rows under its column labels', () => {
		const table = widgetExport(
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
			widgetExport(
				widgetBuilder({
					layout: { root: 'g', elements: { g: { type: 'Gauge', props: {}, children: [] } } }
				})
			).blocks
		).toEqual([{ kind: 'unsupported', type: 'Gauge' }]);
	});
});

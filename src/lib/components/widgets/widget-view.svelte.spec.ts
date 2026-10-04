import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { WidgetChange } from '$lib/models/widgets';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import { widgetTemplates } from '$lib/models/widgets';
import WidgetView from './widget-view.svelte';

describe('Widget view', () => {
	it('hands a ticked checkbox over as one data change at that item', async () => {
		const changes: WidgetChange[] = [];
		const screen = await render(WidgetView, {
			widget: widgetBuilder({ dataRevision: 5 }),
			onChange: async (change) => {
				changes.push(change);
				return { kind: 'staged' };
			}
		});
		await screen.getByRole('checkbox').nth(1).click();
		await expect
			.poll(() => changes)
			.toEqual([
				{
					kind: 'data',
					patch: [{ op: 'replace', path: '/items/1/done', value: true }]
				}
			]);
	});
	it('shows the widget read-only without a change handler', async () => {
		const screen = await render(WidgetView, { widget: widgetBuilder() });
		await expect.element(screen.getByRole('checkbox').first()).toBeDisabled();
	});
	it('names an element the catalog no longer has instead of dropping it', async () => {
		const screen = await render(WidgetView, {
			widget: widgetBuilder({
				layout: { root: 'gone', elements: { gone: { type: 'Gauge', props: {}, children: [] } } }
			})
		});
		await expect.element(screen.getByText(/uses a Gauge element/)).toBeVisible();
	});
});

describe('Widget view typing', () => {
	it('hands a burst of typing over as one data change after a pause', async () => {
		const changes: WidgetChange[] = [];
		const screen = await render(WidgetView, {
			widget: widgetBuilder({
				layout: widgetTemplates.progress.layout,
				data: widgetTemplates.progress.data
			}),
			onChange: async (change) => {
				changes.push(change);
				return { kind: 'staged' };
			}
		});
		await screen.getByLabelText('Note').fill('Waiting on legal');
		await expect
			.poll(() => changes)
			.toEqual([
				{ kind: 'data', patch: [{ op: 'replace', path: '/note', value: 'Waiting on legal' }] }
			]);
	});
	it('shows a badge only while its rule holds', async () => {
		const screen = await render(WidgetView, {
			widget: widgetBuilder({
				layout: widgetTemplates.status.layout,
				data: widgetTemplates.status.data
			})
		});
		await expect.poll(() => screen.getByText('Needs attention').elements().length).toBe(1);
	});
});

describe('Widget view formulas', () => {
	const savings = () =>
		widgetBuilder({ layout: widgetTemplates.savings.layout, data: widgetTemplates.savings.data });
	it('shows a value worked out from the data', async () => {
		const screen = await render(WidgetView, { widget: savings() });
		await expect.element(screen.getByText('129,885')).toBeVisible();
	});
	it('works the value out again as a control changes the data', async () => {
		const screen = await render(WidgetView, {
			widget: savings(),
			onChange: async () => ({ kind: 'staged' })
		});
		await screen.getByLabelText('Monthly deposit').fill('0');
		await expect.element(screen.getByText('27,126')).toBeVisible();
	});
	it('hands over only the data, never the computed values', async () => {
		const changes: WidgetChange[] = [];
		const screen = await render(WidgetView, {
			widget: savings(),
			onChange: async (change) => {
				changes.push(change);
				return { kind: 'staged' };
			}
		});
		await screen.getByLabelText('Years').fill('10');
		await expect
			.poll(() => changes)
			.toEqual([{ kind: 'data', patch: [{ op: 'replace', path: '/years', value: 10 }] }]);
	});
	it('says which formula failed and why', async () => {
		const screen = await render(WidgetView, {
			widget: widgetBuilder({
				layout: { ...widgetTemplates.blank.layout, derived: { ratio: '@/a / @/b' } },
				data: { ...widgetTemplates.blank.data, a: 1, b: 0 }
			})
		});
		await expect.element(screen.getByText('ratio: Division by zero')).toBeVisible();
	});
});

describe('Widget view buttons', () => {
	it('adds the typed item to the list when Add is pressed', async () => {
		const screen = await render(WidgetView, {
			widget: widgetBuilder(),
			onChange: async () => ({ kind: 'staged' })
		});
		await screen.getByLabelText('New item').fill('Fourth step');
		await screen.getByRole('button', { name: 'Add' }).click();
		await expect.element(screen.getByText('Fourth step')).toBeVisible();
	});
	it('keeps Add off while nothing is typed', async () => {
		const screen = await render(WidgetView, {
			widget: widgetBuilder(),
			onChange: async () => ({ kind: 'staged' })
		});
		await expect.element(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
	});
});

describe('Widget view charts', () => {
	const chart = (type: 'LineChart' | 'AreaChart' | 'BarChart', rows: object[]) =>
		widgetBuilder({
			layout: {
				root: 'chart',
				elements: {
					chart: {
						type,
						props: {
							title: 'Spend',
							rows: { $state: '/rows' },
							x: 'month',
							series: [
								{ key: 'food', label: 'Food' },
								{ key: 'rent', label: 'Rent' }
							]
						},
						children: []
					}
				}
			},
			data: { rows: JSON.parse(JSON.stringify(rows)) }
		});
	const months = [
		{ month: 'Jan', food: 300, rent: 900 },
		{ month: 'Feb', food: 280, rent: 900 },
		{ month: 'Mar', food: 320, rent: 950 }
	];
	it('draws a line chart as an svg with one path per series', async () => {
		const screen = await render(WidgetView, { widget: chart('LineChart', months) });
		await expect
			.poll(() => screen.container.querySelectorAll('[data-slot="chart"] svg path.lc-path').length)
			.toBe(2);
	});
	it('draws a bar per row and series', async () => {
		const screen = await render(WidgetView, { widget: chart('BarChart', months) });
		await expect
			.poll(() => screen.container.querySelectorAll('[data-slot="chart"] svg .lc-bar').length)
			.toBe(6);
	});
	it('names each series in a legend, so colour is not the only key', async () => {
		const screen = await render(WidgetView, { widget: chart('AreaChart', months) });
		await expect.element(screen.getByText('Rent')).toBeVisible();
	});
	it('says there is nothing to plot when the rows are empty', async () => {
		const screen = await render(WidgetView, { widget: chart('LineChart', []) });
		await expect.element(screen.getByText('Nothing to plot yet.')).toBeVisible();
	});
});

describe('Widget view data table', () => {
	const expenses = () =>
		widgetBuilder({ layout: widgetTemplates.expenses.layout, data: widgetTemplates.expenses.data });
	const recorded = () => {
		const changes: WidgetChange[] = [];
		return {
			changes,
			onChange: async (change: WidgetChange) => {
				changes.push(change);
				return { kind: 'staged' as const };
			}
		};
	};
	it('hands an edited cell over as a change of that cell alone', async () => {
		const { changes, onChange } = recorded();
		const screen = await render(WidgetView, { widget: expenses(), onChange });
		await screen.getByLabelText('Amount, row 3').fill('70');
		await expect
			.poll(() => changes)
			.toEqual([
				{ kind: 'data', patch: [{ op: 'replace', path: '/expenses/2/amount', value: 70 }] }
			]);
	});
	it('totals the rows in the footer as a cell changes', async () => {
		const screen = await render(WidgetView, {
			widget: expenses(),
			onChange: async () => ({ kind: 'staged' })
		});
		await screen.getByLabelText('Amount, row 1').fill('1000');
		await expect.element(screen.getByRole('cell', { name: '1,246.50' })).toBeVisible();
	});
	it('adds an empty row', async () => {
		const screen = await render(WidgetView, {
			widget: expenses(),
			onChange: async () => ({ kind: 'staged' })
		});
		await screen.getByRole('button', { name: 'Add expense' }).click();
		await expect.element(screen.getByLabelText('Item, row 4')).toHaveValue('');
	});
	it('removes a row', async () => {
		const { changes, onChange } = recorded();
		const screen = await render(WidgetView, { widget: expenses(), onChange });
		await screen.getByRole('button', { name: 'Remove row 1' }).click();
		await expect
			.poll(() => changes.map((change) => change.kind === 'data' && change.patch[0]?.path))
			.toEqual(['/expenses']);
	});
});

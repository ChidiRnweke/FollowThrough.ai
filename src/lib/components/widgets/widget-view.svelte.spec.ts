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

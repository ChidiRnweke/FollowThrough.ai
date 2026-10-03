import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { WidgetEdit } from '$lib/models/widgets';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import WidgetView from './widget-view.svelte';

describe('Widget view', () => {
	it('hands a ticked checkbox over as one data edit at the current revision', async () => {
		const edits: WidgetEdit[] = [];
		const screen = await render(WidgetView, {
			widget: widgetBuilder({ dataRevision: 5 }),
			onEdit: async (edit) => {
				edits.push(edit);
				return { kind: 'staged' };
			}
		});
		await screen.getByRole('checkbox').nth(1).click();
		await expect
			.poll(() => edits)
			.toEqual([
				{
					kind: 'data',
					expectedDataRevision: 5,
					patch: [{ op: 'replace', path: '/items/1/done', value: true }]
				}
			]);
	});
	it('shows the widget read-only without an edit handler', async () => {
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

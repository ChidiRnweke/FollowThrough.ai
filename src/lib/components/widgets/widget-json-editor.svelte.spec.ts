import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { WidgetChange } from '$lib/models/widgets';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import WidgetJsonEditor from './widget-json-editor.svelte';

describe('Widget JSON editor', () => {
	it('names a problem and keeps Apply off while the layout is refused', async () => {
		const screen = await render(WidgetJsonEditor, {
			widget: widgetBuilder(),
			onapply: async () => undefined,
			oncancel: () => undefined
		});
		await screen
			.getByLabelText('Layout')
			.fill(
				JSON.stringify({ root: 'x', elements: { x: { type: 'Iframe', props: {}, children: [] } } })
			);
		await expect.element(screen.getByText('Iframe is not in the widget catalog')).toBeVisible();
	});
	it('applies an edited label as one data change', async () => {
		const applied: (readonly WidgetChange[])[] = [];
		const widget = widgetBuilder();
		const screen = await render(WidgetJsonEditor, {
			widget,
			onapply: async (changes) => {
				applied.push(changes);
			},
			oncancel: () => undefined
		});
		await screen.getByLabelText('Data').fill(
			JSON.stringify({
				...widget.data,
				items: [{ id: 'first', label: 'Write the brief', done: false }]
			})
		);
		await screen.getByRole('button', { name: 'Apply' }).click();
		await expect
			.poll(() => applied)
			.toEqual([
				[
					{
						kind: 'data',
						patch: [
							{
								op: 'replace',
								path: '/items',
								value: [{ id: 'first', label: 'Write the brief', done: false }]
							}
						]
					}
				]
			]);
	});
});

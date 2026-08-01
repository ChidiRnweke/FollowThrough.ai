import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ExportSlider from './export-slider.svelte';

const base = {
	label: 'Turn limit',
	value: 20,
	min: 1,
	max: 50,
	step: 1,
	defaultValue: 20,
	anchors: [
		{ value: 1, label: 'Cautious' },
		{ value: 20, label: 'Default' },
		{ value: 50, label: 'Deep research' }
	],
	describe: (current: number) => (current < 30 ? 'standard runs' : 'long research runs'),
	onchange: () => undefined
};

describe('ExportSlider', () => {
	it('labels the control for assistive tech', async () => {
		const screen = await render(ExportSlider, { ...base });
		await expect.element(screen.getByRole('slider', { name: 'Turn limit' })).toBeVisible();
	});

	it('shows the current value', async () => {
		const screen = await render(ExportSlider, { ...base });
		await expect.element(screen.getByText('20')).toBeVisible();
	});

	it('describes how the current value reads', async () => {
		const screen = await render(ExportSlider, { ...base });
		await expect.element(screen.getByText(/standard runs/)).toBeVisible();
	});

	it('marks the deployment default among the anchors', async () => {
		const screen = await render(ExportSlider, { ...base });
		const anchor = screen.getByText('Default');
		await expect.element(anchor).toHaveClass(/font-medium/);
	});

	it('keeps the accessible name when showLabel is false', async () => {
		const screen = await render(ExportSlider, { ...base, showLabel: false });
		await expect.element(screen.getByRole('slider', { name: 'Turn limit' })).toBeVisible();
	});

	it('hides the visible label when showLabel is false', async () => {
		const screen = await render(ExportSlider, { ...base, showLabel: false });
		await expect.element(screen.getByText('Turn limit')).not.toBeInTheDocument();
	});

	it('reports drags as numbers', async () => {
		let changed: number | undefined;
		const onchange = (value: number) => (changed = value);
		const screen = await render(ExportSlider, { ...base, onchange });
		await screen.getByRole('slider').fill('35');
		expect(changed).toBe(35);
	});
});

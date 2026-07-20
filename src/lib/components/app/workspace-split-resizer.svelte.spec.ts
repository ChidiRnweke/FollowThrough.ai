import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import WorkspaceSplitResizer from './workspace-split-resizer.svelte';

afterEach(cleanup);

describe('WorkspaceSplitResizer', () => {
	it('exposes a named vertical separator', async () => {
		const screen = await render(WorkspaceSplitResizer, {
			initialSecondaryRatio: 0.5,
			onRatioChange: () => undefined
		});

		await expect
			.element(screen.getByRole('separator', { name: 'Resize note panes' }))
			.toHaveAccessibleName('Resize note panes');
	});

	it('resizes by keyboard arrow input', async () => {
		const ratios: number[] = [];
		const screen = await render(WorkspaceSplitResizer, {
			initialSecondaryRatio: 0.5,
			onRatioChange: (ratio) => ratios.push(ratio)
		});
		const separator = screen
			.getByRole('separator', { name: 'Resize note panes' })
			.element() as HTMLElement;

		separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(ratios.at(-1)).toBe(0.55);
	});

	it('keeps keyboard resizing within the 25–75 percent limits', async () => {
		const ratios: number[] = [];
		const screen = await render(WorkspaceSplitResizer, {
			initialSecondaryRatio: 0.75,
			onRatioChange: (ratio) => ratios.push(ratio)
		});
		const separator = screen
			.getByRole('separator', { name: 'Resize note panes' })
			.element() as HTMLElement;

		separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(ratios.at(-1)).toBeLessThanOrEqual(0.75);
	});

	it('resets both panes to equal width on double-click', async () => {
		const ratios: number[] = [];
		const screen = await render(WorkspaceSplitResizer, {
			initialSecondaryRatio: 0.65,
			onRatioChange: (ratio) => ratios.push(ratio)
		});

		screen
			.getByRole('separator', { name: 'Resize note panes' })
			.element()
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

		expect(ratios.at(-1)).toBe(0.5);
	});
});

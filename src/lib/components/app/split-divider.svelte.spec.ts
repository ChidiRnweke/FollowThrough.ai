import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from 'vitest-browser-svelte';

// The divider only depends on `workbench.setSplitRatio` and
// `workbench.setSplit`.  Both are spied so each test can assert the
// recorded clamp + double-click reset behaviour without dragging the real
// store (which writes to localStorage / IndexedDB).
const setSplitRatio = vi.fn();
const setSplit = vi.fn();

vi.mock('$lib/stores/workbench.svelte', () => ({
	workbench: { setSplitRatio, setSplit }
}));

const SplitDivider = (await import('./split-divider.svelte')).default;

afterEach(() => {
	cleanup();
	setSplitRatio.mockClear();
	setSplit.mockClear();
});

describe('SplitDivider', () => {
	it('renders as an ARIA separator', async () => {
		const screen = await render(SplitDivider);
		const separator = screen.getByRole('separator');
		await expect.element(separator).toBeVisible();
	});

	it('resets the ratio to 0.5 on double-click', async () => {
		const screen = await render(SplitDivider);
		const separator = screen.getByRole('separator').element();
		separator.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		// Svelte's handler runs synchronously on dispatchEvent, so the spy
		// should already be called by the time we reach the assertion.
		expect(setSplitRatio).toHaveBeenCalledWith(0.5);
	});

	it('closes the split when the × button is clicked', async () => {
		const screen = await render(SplitDivider);
		const closeButton = screen
			.getByRole('button', { name: 'Close split pane' })
			.element() as HTMLButtonElement;
		closeButton.click();
		expect(setSplit).toHaveBeenCalledWith(undefined);
	});

	it('ignores right-click pointerdown (button !== 0)', async () => {
		const screen = await render(SplitDivider);
		const separator = screen.getByRole('separator').element();
		separator.dispatchEvent(
			new PointerEvent('pointerdown', { button: 2, bubbles: true, cancelable: true })
		);
		// Right-click must not start a drag — no ratio write should occur.
		expect(setSplitRatio).not.toHaveBeenCalled();
	});

	it('writes a clamped ratio after a left-button pointerdown', async () => {
		const screen = await render(SplitDivider);
		const separator = screen.getByRole('separator').element();
		// Provide a fake parent element so the handler can read its bounding
		// rect.  A 1000px-wide container with the cursor at x=100 places
		// the resulting ratio at 0.1, which is the minimum clamp.
		const parent = separator.parentElement ?? document.body;
		vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({
			left: 0,
			right: 1000,
			width: 1000,
			height: 10,
			top: 0,
			bottom: 10,
			x: 0,
			y: 0,
			toJSON: () => ({})
		});
		separator.dispatchEvent(
			new PointerEvent('pointerdown', {
				button: 0,
				clientX: 100,
				bubbles: true,
				cancelable: true,
				pointerId: 1
			})
		);
		// rAF is throttled; flush synchronously.
		await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
		expect(setSplitRatio).toHaveBeenCalled();
		const ratio = setSplitRatio.mock.calls[0][0] as number;
		expect(ratio).toBeGreaterThanOrEqual(0.1);
		expect(ratio).toBeLessThanOrEqual(0.9);
	});
});
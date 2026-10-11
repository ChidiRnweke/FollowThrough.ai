import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import '../../../../routes/layout.css';
import { Checkbox } from './index';

const checkMotion = (root: Element) => {
	const stroke = root.querySelector('[data-slot="checkbox-indicator"] .ft-stroke');
	return stroke ? getComputedStyle(stroke).animationName : 'no check';
};

describe('checkbox tick', () => {
	it('shows a box that loads ticked without drawing its check', async () => {
		const { container } = await render(Checkbox, { checked: true, 'aria-label': 'Done' });
		expect(checkMotion(container)).toBe('none');
	});

	// Ticked through its value, with the pointer moved off, rather than by a click: hovering a
	// control replays its icon by itself, which would pass this without the tick drawing.
	it('draws the check in when the box is ticked', async () => {
		const screen = await render(Checkbox, { 'aria-label': 'Done' });
		await userEvent.unhover(screen.getByRole('checkbox', { name: 'Done' }));
		await screen.rerender({ 'aria-label': 'Done', checked: true });
		await expect.poll(() => checkMotion(screen.container)).toBe('ft-trace');
	});
});

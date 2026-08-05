import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { FtSuggestion } from '$lib/components/icons';
import ActionProgress from './action-progress.svelte';

const props = (overrides: Record<string, unknown> = {}) => ({
	icon: FtSuggestion,
	label: 'Converting to draw.io',
	...overrides
});

describe('Action progress row', () => {
	it('names the cancel control after the action it stops', async () => {
		const screen = await render(ActionProgress, props({ oncancel: () => undefined }) as never);
		await expect
			.element(screen.getByRole('button', { name: 'Cancel converting to draw.io' }))
			.toBeVisible();
	});

	it('offers no cancel control for work that cannot be stopped', async () => {
		const screen = await render(ActionProgress, props() as never);
		await expect.element(screen.getByRole('button')).not.toBeInTheDocument();
	});

	it('reports the action as stopping once cancellation is requested', async () => {
		const screen = await render(
			ActionProgress,
			props({ cancelling: true, oncancel: () => undefined }) as never
		);
		await expect.element(screen.getByRole('status')).toHaveTextContent('Stopping…');
	});

	it('disables the cross while the cancellation settles', async () => {
		const screen = await render(
			ActionProgress,
			props({ cancelling: true, oncancel: () => undefined }) as never
		);
		await expect.element(screen.getByRole('button', { name: 'Stopping' })).toBeDisabled();
	});

	it('runs the cancel handler when the cross is clicked', async () => {
		const clicks: number[] = [];
		const screen = await render(ActionProgress, props({ oncancel: () => clicks.push(1) }) as never);
		await screen.getByRole('button', { name: 'Cancel converting to draw.io' }).click();

		expect(clicks).toEqual([1]);
	});
});

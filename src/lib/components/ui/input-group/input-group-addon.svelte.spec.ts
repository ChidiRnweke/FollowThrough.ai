import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import InputGroupAddonFixture from './input-group-addon.fixture.svelte';

const focusedPlaceholder = () =>
	(document.activeElement as HTMLInputElement | null)?.placeholder;

describe('InputGroupAddon focus ownership', () => {
	it('focuses the owned input when a non-button addon is clicked', async () => {
		const screen = await render(InputGroupAddonFixture);
		await screen.getByText('Search').click();
		expect(focusedPlaceholder()).toBe('Weight');
	});

	it('does not steal focus when a nested button is clicked', async () => {
		const screen = await render(InputGroupAddonFixture);
		const button = screen.getByRole('button', { name: 'Toggle unit' });
		await button.click();
		expect(focusedPlaceholder()).toBeUndefined();
	});
});

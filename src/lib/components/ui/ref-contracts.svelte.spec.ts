import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RefContractsFixture from './ref-contracts.fixture.svelte';

describe('public UI ref contracts', () => {
	it('binds Input to its native input element', async () => {
		const screen = await render(RefContractsFixture, { kind: 'input' });

		await expect
			.element(screen.getByRole('status', { name: 'bound element' }))
			.toHaveTextContent('INPUT');
	});

	it('binds Separator to its rendered native element', async () => {
		const screen = await render(RefContractsFixture, { kind: 'separator' });

		await expect
			.element(screen.getByRole('status', { name: 'bound element' }))
			.toHaveTextContent('DIV');
	});

	it('forwards SidebarSeparator to its rendered native element', async () => {
		const screen = await render(RefContractsFixture, { kind: 'sidebar-separator' });

		await expect
			.element(screen.getByRole('status', { name: 'bound element' }))
			.toHaveTextContent('DIV');
	});

	it('forwards Tooltip trigger to its interactive element', async () => {
		const screen = await render(RefContractsFixture, { kind: 'tooltip-trigger' });

		await expect
			.element(screen.getByRole('status', { name: 'bound element' }))
			.toHaveTextContent('BUTTON');
	});
});

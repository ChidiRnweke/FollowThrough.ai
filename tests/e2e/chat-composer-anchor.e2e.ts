import { expect, test } from '@playwright/test';

const surfaces = [
	{
		name: 'docked panel',
		width: 1600,
		height: 1060,
		frame: 'aside[aria-label="Agent"]',
		inset: 16
	},
	{
		name: 'mobile sheet',
		width: 375,
		height: 812,
		frame: '[data-slot="sheet-content"]',
		inset: 16
	},
	{ name: 'workbench', width: 1600, height: 1060, frame: '[data-chat-pane]', inset: 0 },
	{
		name: 'full-page chat',
		width: 1600,
		height: 1060,
		frame: 'main > .safe-panel-bottom',
		inset: 16
	}
] as const;

for (const surface of surfaces) {
	for (const state of ['empty', 'multiline draft', 'cleared draft', 'resized'] as const) {
		test(`${surface.name} keeps the composer at the bottom with ${state}`, async ({ page }) => {
			await page.setViewportSize({ width: surface.width, height: surface.height });
			await page.goto(surface.name === 'full-page chat' ? '/chats/new' : '/today');
			if (surface.name !== 'full-page chat') {
				await page
					.getByRole('button', {
						name: surface.name === 'mobile sheet' ? 'Open chat' : 'Toggle chat panel',
						exact: true
					})
					.click();
			}
			if (surface.name === 'workbench') {
				await page.getByRole('button', { name: 'Open chat in workbench', exact: true }).click();
			}
			const frame = page.locator(surface.frame);
			const composer = frame.locator('#chat-composer');
			await composer.waitFor();
			if (state === 'multiline draft' || state === 'cleared draft') {
				await composer.fill('Review this deployment option.\n'.repeat(30));
			}
			if (state === 'cleared draft') await composer.fill('');
			if (state === 'resized') {
				await page.setViewportSize({ width: surface.width, height: 600 });
				await page.setViewportSize({ width: surface.width, height: 1100 });
			}

			await expect
				.poll(async () =>
					frame.evaluate((element, inset) => {
						const field = element
							.querySelector('#chat-composer')
							?.closest('[data-slot="input-group"]');
						if (!field) throw new Error('The composer input group did not render');
						return Math.abs(
							element.getBoundingClientRect().bottom - field.getBoundingClientRect().bottom - inset
						);
					}, surface.inset)
				)
				.toBeLessThanOrEqual(1);
		});
	}
}

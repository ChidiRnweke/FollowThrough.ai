import { expect, test } from '@playwright/test';

const viewports = [
	{ name: 'base mobile', width: 375, height: 667 },
	{ name: 'phone landscape', width: 667, height: 375 },
	{ name: 'sm', width: 640, height: 800 },
	{ name: 'md', width: 768, height: 900 },
	{ name: 'lg', width: 1024, height: 900 },
	{ name: 'xl', width: 1280, height: 900 },
	{ name: '2xl', width: 1536, height: 960 }
] as const;

for (const viewport of viewports) {
	test(`${viewport.name} shell has no document-level horizontal overflow`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await page.goto('/todos');
		const fits = await page.evaluate(
			() => document.documentElement.scrollWidth === document.documentElement.clientWidth
		);
		expect(fits).toBe(true);
	});
}

test('mobile application navigation is reachable outside the sidebar sheet', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto('/');
	await expect(
		page.locator('header').getByRole('button', { name: 'Toggle Sidebar' })
	).toBeVisible();
});

test('compact todo board uses readable horizontal columns', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto('/todos?view=board');
	const columnWidth = await page
		.locator('section')
		.filter({ hasText: 'Backlog' })
		.first()
		.evaluate((element) => element.getBoundingClientRect().width);
	expect(columnWidth).toBeGreaterThan(280);
});

test('compact todo list uses stacked records', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto('/todos?view=list');
	const tableVisible = await page
		.locator('table')
		.isVisible()
		.catch(() => false);
	expect(tableVisible).toBe(false);
});

test('2xl retains the inline contextual panel width', async ({ page }) => {
	await page.setViewportSize({ width: 1536, height: 960 });
	await page.goto('/');
	await page.getByRole('button', { name: 'Toggle chat panel' }).click();
	const width = await page
		.locator('aside[aria-label="Chat"]')
		.evaluate((element) => element.getBoundingClientRect().width);
	expect(width).toBe(384);
});

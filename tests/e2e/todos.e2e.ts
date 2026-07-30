import { expect, test } from '@playwright/test';

const desktop = { width: 1440, height: 900 } as const;

test('list view fits its canvas instead of scrolling inside it', async ({ page }) => {
	await page.setViewportSize(desktop);
	await page.goto('/todos?view=list');
	const scroller = page.locator('[data-todo-table-scroll]');
	await scroller.waitFor();
	const overflows = await scroller.evaluate((element) => element.scrollWidth > element.clientWidth);
	expect(overflows).toBe(false);
});

test('board columns use the wide canvas rather than the reading measure', async ({ page }) => {
	await page.setViewportSize(desktop);
	await page.goto('/todos?view=board');
	const column = page.locator('section').filter({ hasText: 'Backlog' }).first();
	await column.waitFor();
	const width = await column.evaluate((element) => element.getBoundingClientRect().width);
	// Four columns inside the old max-w-5xl shell measured ~220px each.
	expect(width).toBeGreaterThan(280);
});

test('board cards omit metadata that is not set', async ({ page }) => {
	await page.setViewportSize(desktop);
	await page.goto('/todos?view=board');
	await page.locator('section').filter({ hasText: 'Backlog' }).first().waitFor();
	await expect(page.getByText('No priority')).toHaveCount(0);
	await expect(page.getByText('No due date')).toHaveCount(0);
	await expect(page.getByText('No source')).toHaveCount(0);
});

test('toolbar search filters board cards live', async ({ page }) => {
	await page.setViewportSize(desktop);
	await page.goto('/todos?view=board');
	await page.locator('section').filter({ hasText: 'Backlog' }).first().waitFor();
	const cards = page.locator('[data-slot="card"]');
	const initial = await cards.count();
	const search = page.getByLabel('Filter todos by title');
	await search.fill('definitely-not-a-todo-title');
	await expect(cards).toHaveCount(0);
	await search.fill('');
	await expect(cards).toHaveCount(initial);
});

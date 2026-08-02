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

test('quick-add focuses its input on the ?quickTodo load path', async ({ page }) => {
	await page.setViewportSize(desktop);
	await page.goto('/todos?view=board&quickTodo');
	await expect(page.locator('#quick-todo-input')).toBeFocused();
});

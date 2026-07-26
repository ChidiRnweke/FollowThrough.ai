import { expect, test } from '@playwright/test';

const viewports = [
	{ name: 'small mobile', width: 320, height: 568 },
	{ name: 'base mobile', width: 375, height: 667 },
	{ name: 'phone landscape', width: 667, height: 375 },
	{ name: 'sm', width: 640, height: 800 },
	{ name: 'md', width: 768, height: 900 },
	{ name: 'lg', width: 1024, height: 900 },
	{ name: 'xl', width: 1280, height: 900 },
	{ name: '2xl', width: 1536, height: 960 }
] as const;

async function openFirstNote(page: import('@playwright/test').Page): Promise<string> {
	await page.goto('/today');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	await noteLink.waitFor({ state: 'attached' });
	const href = (await noteLink.getAttribute('href'))!;
	await page.goto(href);
	await page.locator('[data-note-pane]').waitFor();
	return href;
}

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
	await page.goto('/today');
	await expect(
		page.locator('header').getByRole('button', { name: 'Toggle Sidebar' })
	).toBeVisible();
});

for (const viewport of viewports.filter(({ width }) => width < 768)) {
	test(`${viewport.name} note toolbar stays inside its pane`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await openFirstNote(page);
		const fits = await page.getByTestId('note-utility-header').evaluate((header) => {
			const pane = header.closest('[data-note-pane]')!;
			const headerBox = header.getBoundingClientRect();
			const paneBox = pane.getBoundingClientRect();
			return headerBox.left >= paneBox.left && headerBox.right <= paneBox.right;
		});
		expect(fits).toBe(true);
	});
}

test('compact note actions expose Export in the overflow menu', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await openFirstNote(page);
	await page.getByRole('button', { name: 'Note actions' }).click();
	await expect(page.getByRole('menuitem', { name: 'Export document' })).toBeVisible();
});

test('compact note toolbar controls use 44px touch targets', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await openFirstNote(page);
	const targetsMeetMinimum = await page
		.getByTestId('note-utility-header')
		.locator('button:visible')
		.evaluateAll((buttons) =>
			buttons.every((button) => {
				const box = button.getBoundingClientRect();
				return box.width >= 44 && box.height >= 44;
			})
		);
	expect(targetsMeetMinimum).toBe(true);
});

test('compact note toolbar keeps the full Publish action visible', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await openFirstNote(page);
	await expect(page.getByRole('button', { name: 'Publish note' })).toContainText('Publish');
});

test('sm note toolbar restores inline Export', async ({ page }) => {
	await page.setViewportSize({ width: 640, height: 800 });
	await openFirstNote(page);
	await expect(page.getByRole('button', { name: 'Export document' })).toBeVisible();
});

test('compact note chat opens without changing the note URL', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	const href = await openFirstNote(page);
	await page.getByRole('button', { name: 'Open chat' }).click();
	await expect(page).toHaveURL(href);
});

test('compact note chat opens in a Sheet with note context', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await openFirstNote(page);
	const noteTitle = (
		await page
			.locator('[data-testid="note-utility-header"] [data-slot="breadcrumb-page"]')
			.innerText()
	).trim();
	await page.getByRole('button', { name: 'Open chat' }).click();
	await expect(page.getByLabel('Chat context')).toContainText(noteTitle);
});

test('closing compact note chat restores focus to its trigger', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await openFirstNote(page);
	const trigger = page.getByRole('button', { name: 'Open chat' });
	await trigger.click();
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(trigger).toBeFocused();
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
	await page.goto('/today');
	await page.getByRole('button', { name: 'Toggle chat panel' }).click();
	const width = await page
		.locator('aside[aria-label="Chat"]')
		.evaluate((element) => element.getBoundingClientRect().width);
	expect(width).toBe(384);
});

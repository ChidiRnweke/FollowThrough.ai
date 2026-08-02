import { expect, test, type Page } from '@playwright/test';

/** The note's title lives in the breadcrumb's current-page segment. */
const titleCrumb = (page: Page) =>
	page
		.locator('[data-note-pane]:visible')
		.first()
		.getByRole('navigation', { name: 'breadcrumb' })
		.locator('[aria-current="page"]');

const titleField = (page: Page) => page.getByRole('textbox', { name: 'Note title' });

async function openFirstNote(page: Page): Promise<void> {
	await page.goto('/today');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	await noteLink.waitFor({ state: 'attached' });
	await page.goto((await noteLink.getAttribute('href'))!);
	await page.locator('[data-note-pane]').waitFor();
}

async function rename(page: Page, title: string): Promise<void> {
	await page.getByRole('button', { name: 'Rename note' }).click();
	await titleField(page).fill(title);
	await titleField(page).press('Enter');
}

test('the note title appears once, in the breadcrumb', async ({ page }) => {
	await openFirstNote(page);
	await expect(titleCrumb(page)).toBeVisible();
	// The standalone title element above the body is gone; nothing is editable until asked.
	await expect(titleField(page)).toHaveCount(0);
});

test('the pencil renames the note in place and the breadcrumb follows', async ({ page }) => {
	await openFirstNote(page);
	const original = (await titleCrumb(page).innerText()).trim();
	const renamed = `${original} renamed`;

	await rename(page, renamed);
	await expect(titleCrumb(page)).toHaveText(renamed);
	// Autosave carries the title to the sidebar entry.
	await expect(page.getByRole('link', { name: renamed, exact: true })).toBeVisible({
		timeout: 15_000
	});

	await rename(page, original);
	await expect(titleCrumb(page)).toHaveText(original);
});

test('Escape abandons a title edit', async ({ page }) => {
	await openFirstNote(page);
	const original = (await titleCrumb(page).innerText()).trim();

	await page.getByRole('button', { name: 'Rename note' }).click();
	await titleField(page).fill('discarded title');
	await titleField(page).press('Escape');

	await expect(titleCrumb(page)).toHaveText(original);
});

test('Enter commits the title and moves the caret into the document body', async ({ page }) => {
	await openFirstNote(page);
	const original = (await titleCrumb(page).innerText()).trim();

	await rename(page, original);

	await expect(titleField(page)).toHaveCount(0);
	await expect(page.locator('[data-note-pane] [contenteditable="true"]').first()).toBeFocused();
});

import { expect, test, type Page } from '@playwright/test';

const checkboxes = (page: Page) =>
	page.locator('[data-slot="widget-checkbox"]').getByRole('checkbox');

const saved = (page: Page) =>
	expect(page.getByRole('button', { name: 'Sync status: Everything is saved' })).toBeVisible({
		timeout: 20_000
	});

async function createNoteInInbox(page: Page, title: string): Promise<void> {
	await page.goto('/today');
	await page.getByRole('button', { name: 'Create in Inbox' }).click();
	await page.getByRole('menuitem', { name: 'New note' }).click();
	await page.getByPlaceholder(/Note title/).fill(title);
	await page.getByPlaceholder(/Note title/).press('Enter');
	await page.getByRole('link', { name: title }).first().click();
	await page.getByRole('textbox', { name: 'Note body' }).click();
}

test('a widget created in a note keeps what was ticked, in the note and on its own page', async ({
	page
}) => {
	await createNoteInInbox(page, `Widget e2e ${Date.now()}`);
	await page.keyboard.type('/widget');
	await page.keyboard.press('Enter');
	await expect(checkboxes(page)).toHaveCount(3);
	// The note autosaves after a pause; the widget reference must be in the saved body.
	await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 15_000 });

	await checkboxes(page).nth(0).click();
	await saved(page);
	await page.reload();
	await expect(checkboxes(page).nth(0)).toBeChecked();
	await expect(checkboxes(page).nth(1)).not.toBeChecked();

	await page.getByRole('link', { name: 'Open widget' }).click();
	await expect(page).toHaveURL(/\/widgets\/[0-9a-f-]{36}\?.*focus=widget%3A/);
	await expect(page.locator('[data-widget-pane]')).toBeVisible();
	await expect(checkboxes(page).nth(0)).toBeChecked();
	await checkboxes(page).nth(1).click();
	await saved(page);
	await page.goBack();
	await expect(checkboxes(page).nth(1)).toBeChecked();
});

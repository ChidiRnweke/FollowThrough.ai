import { expect, test, type Page } from '@playwright/test';

const checkboxes = (page: Page) =>
	page.locator('[data-slot="widget-checkbox"]').getByRole('checkbox');

/** Wait for the queue to deliver one write, so a reload cannot overtake it. */
const delivered = (page: Page) =>
	page.waitForResponse((response) => response.url().includes('pushWorkspaceMutation'));

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

	const tick = delivered(page);
	await checkboxes(page).nth(0).click();
	await tick;
	await saved(page);
	await page.reload();
	await expect(checkboxes(page).nth(0)).toBeChecked();
	await expect(checkboxes(page).nth(1)).not.toBeChecked();

	await page.getByRole('link', { name: 'Open widget' }).click();
	await expect(page).toHaveURL(/\/widgets\/[0-9a-f-]{36}\?.*focus=widget%3A/);
	await expect(page.locator('[data-widget-pane]')).toBeVisible();
	await expect(checkboxes(page).nth(0)).toBeChecked();
	const second = delivered(page);
	await checkboxes(page).nth(1).click();
	await second;
	await saved(page);
	await page.goBack();
	await expect(checkboxes(page).nth(1)).toBeChecked();
});

test('a widget moved to the trash from the gallery shows as trashed in its note and comes back', async ({
	page
}) => {
	const title = `Widget e2e ${Date.now()}`;
	await createNoteInInbox(page, title);
	const noteUrl = page.url();
	await page.keyboard.type('/widget');
	await page.keyboard.press('Enter');
	await expect(checkboxes(page)).toHaveCount(3);
	await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 15_000 });
	await saved(page);
	const widgetId = await page
		.locator('[data-widget-node]')
		.first()
		.getAttribute('data-widget-node');

	await page.goto('/today');
	await page.getByRole('link', { name: 'Inbox', exact: true }).first().click();
	await page.getByRole('link', { name: 'Widgets' }).click();
	const card = page.locator(`[data-widget-card="${widgetId}"]`);
	await card.hover();
	await card.getByRole('button', { name: /Actions for/ }).click();
	await page.getByRole('menuitem', { name: 'Move to trash' }).click();
	const archived = delivered(page);
	await page.getByRole('button', { name: 'Move to trash' }).click();
	await archived;
	await saved(page);

	await page.goto(noteUrl);
	await expect(page.getByText('is in the trash.')).toBeVisible();

	await page.goto('/trash');
	const row = page
		.getByRole('list', { name: 'Items in the trash' })
		.getByRole('listitem')
		.filter({ hasText: 'Checklist' })
		.first();
	await row.hover();
	const restored = delivered(page);
	await row.getByRole('button', { name: /Restore/ }).click();
	await restored;
	await saved(page);
	await page.goto(noteUrl);
	await expect(checkboxes(page)).toHaveCount(3);
});

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

/** Run the Widget command and choose a template in the picker. */
async function insertTemplate(page: Page, name: string): Promise<void> {
	await page.keyboard.type('/widget');
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: `New ${name}` }).click();
}

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
	await insertTemplate(page, 'Checklist');
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
	await insertTemplate(page, 'Checklist');
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

test('a status board from the picker saves a chosen status and shows its flag', async ({
	page
}) => {
	await createNoteInInbox(page, `Widget e2e ${Date.now()}`);
	await insertTemplate(page, 'Status board');
	await expect(page.getByText('Needs attention')).toHaveCount(1);
	await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 15_000 });
	await saved(page);

	const choice = delivered(page);
	await page.getByRole('button', { name: 'Build', exact: true }).click();
	await page.getByRole('option', { name: 'Blocked' }).click();
	await choice;
	await saved(page);
	await page.reload();
	await expect(page.getByText('Needs attention')).toHaveCount(2);
});

test('the gallery hands widget building to the agent and creates nothing itself', async ({
	page
}) => {
	await page.goto('/today');
	await page.getByRole('link', { name: 'Inbox', exact: true }).first().click();
	await page.getByRole('link', { name: 'Widgets' }).click();
	await page.getByRole('button', { name: 'Build a widget', exact: true }).click();

	await expect(page.locator('#chat-composer')).toHaveValue(/Build a widget for this project that/);
	await expect(page.locator('[data-widget-pane]')).toHaveCount(0);
});

test('a widget is changed through the agent, and its JSON waits under Advanced', async ({
	page
}) => {
	await createNoteInInbox(page, `Widget e2e ${Date.now()}`);
	await insertTemplate(page, 'Checklist');
	await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 15_000 });
	await page.getByRole('link', { name: 'Open widget' }).first().click();
	const pane = page.locator('[data-widget-pane]');
	await expect(pane.getByLabel('Layout', { exact: true })).toBeHidden();

	await pane.getByRole('tab', { name: 'Advanced' }).click();
	await pane.getByLabel('Title', { exact: true }).fill('Release notes');
	const applied = delivered(page);
	await pane.getByRole('button', { name: 'Apply' }).click();
	await applied;
	await expect(pane.getByRole('tab', { name: 'Widget', selected: true })).toBeVisible();
	await saved(page);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Release notes' })).toBeVisible();

	// Last: below the docked breakpoint the chat is a page of its own and replaces the pane.
	await pane.getByRole('button', { name: 'Change with agent' }).click();
	await expect(page.locator('#chat-composer')).toHaveValue(/Change this widget so that/);
	await expect(page.getByLabel('Chat context').getByText('Release notes')).toBeVisible();
});

test('the note picker hands a described widget to the agent for this note', async ({ page }) => {
	await createNoteInInbox(page, `Widget e2e ${Date.now()}`);
	await page.keyboard.type('/widget');
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Build a widget', exact: true }).click();

	await expect(page.locator('[data-widget-picker]')).toBeHidden();
	await expect(page.locator('#chat-composer')).toHaveValue(/Build a widget in this note that/);
});

test('a savings simulator works its balance out as the inputs move, and keeps them', async ({
	page
}) => {
	await createNoteInInbox(page, `Widget e2e ${Date.now()}`);
	await insertTemplate(page, 'Savings simulator');
	const widget = page.locator('[data-widget-node] [data-slot="widget-view"]').first();
	await expect(widget.getByText('129,885')).toBeVisible();
	await expect(widget.locator('[data-slot="chart"] svg').first()).toBeVisible();
	await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 15_000 });

	const write = delivered(page);
	await widget.getByLabel('Monthly deposit').fill('500');
	await widget.getByRole('slider', { name: 'Years' }).focus();
	for (let step = 0; step < 10; step++) await page.keyboard.press('ArrowRight');
	await expect(widget.getByText('Balance after 30 years')).toBeVisible();
	await expect(widget.getByText('460,807')).toBeVisible();
	await write;
	await saved(page);
	await page.reload();
	await expect(page.getByText('460,807')).toBeVisible();
});

test('an expense tracker totals a row added in its table, and keeps it', async ({ page }) => {
	await createNoteInInbox(page, `Widget e2e ${Date.now()}`);
	await insertTemplate(page, 'Expense tracker');
	const widget = page.locator('[data-widget-node] [data-slot="widget-view"]').first();
	await expect(widget.getByRole('cell', { name: '1,446.50' })).toBeVisible();
	await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 15_000 });

	await widget.getByRole('button', { name: 'Add expense' }).click();
	await widget.getByLabel('Item, row 4').fill('Dinner out');
	const write = delivered(page);
	await widget.getByLabel('Amount, row 4').fill('53.5');
	await expect(widget.getByRole('cell', { name: '1,500.00' })).toBeVisible();
	await write;
	await saved(page);
	await page.reload();
	await expect(page.getByLabel('Item, row 4')).toHaveValue('Dinner out');
	await expect(page.getByRole('cell', { name: '1,500.00' })).toBeVisible();
});

test('a project dashboard counts a todo added elsewhere in its project', async ({ page }) => {
	await createNoteInInbox(page, `Widget e2e ${Date.now()}`);
	const noteUrl = page.url();
	await insertTemplate(page, 'Project dashboard');
	const openCount = page
		.locator('[data-widget-node] [data-slot="widget-metric"]')
		.filter({ hasText: 'Open todos' })
		.locator('span')
		.nth(1);
	await expect(openCount).toHaveText(/^\d+$/);
	const before = Number(await openCount.textContent());
	await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 15_000 });
	await saved(page);

	await page.goto('/todos?view=board&quickTodo');
	await page.locator('#quick-todo-input').fill(`Widget e2e todo ${Date.now()}`);
	const created = delivered(page);
	await page.locator('#quick-todo-input').press('Enter');
	await created;
	await saved(page);
	await page.goto(noteUrl);
	await expect(openCount).toHaveText(String(before + 1));
});

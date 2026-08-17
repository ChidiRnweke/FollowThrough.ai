import { expect, test, type Page } from '@playwright/test';

/**
 * Copying from the note's context menu.
 *
 * Read-only against the note: it selects and copies, never edits. The regression it
 * guards is invisible to a unit test — opening the menu moves focus onto it, the browser
 * collapses the selection in the contenteditable, and every copy came out empty because
 * the handler read the selection after that had happened.
 */

async function openFirstNote(page: Page): Promise<void> {
	await page.goto('/today');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	await noteLink.waitFor({ state: 'attached' });
	await page.goto((await noteLink.getAttribute('href'))!);
	await page.locator('[data-note-pane]').waitFor();
}

const clipboardText = (page: Page): Promise<string> =>
	page.evaluate(() => navigator.clipboard.readText());

test('copies the selection as Markdown from the context menu', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await openFirstNote(page);

	const heading = page.locator('[data-note-pane] .tiptap h2').first();
	await heading.waitFor();
	const text = (await heading.innerText()).trim();
	await heading.click({ clickCount: 3 });
	await heading.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Copy as markdown' }).click();

	await expect.poll(async () => (await clipboardText(page)).trim()).toBe(`## ${text}`);
});

test('copies a selection the right-click landed away from', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await openFirstNote(page);

	const paragraph = page.locator('[data-note-pane] .tiptap p').first();
	const heading = page.locator('[data-note-pane] .tiptap h2').first();
	await paragraph.click();
	await page.keyboard.down('Shift');
	for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowRight');
	await page.keyboard.up('Shift');
	const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');

	// Right-clicking outside the selection collapses it before the menu even opens.
	await heading.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Copy as markdown' }).click();

	await expect.poll(() => clipboardText(page)).toBe(selected);
});

test('offers no copy when nothing is selected', async ({ page }) => {
	await openFirstNote(page);

	const paragraph = page.locator('[data-note-pane] .tiptap p').first();
	await paragraph.click();
	await paragraph.click({ button: 'right' });

	await expect(page.getByRole('menuitem', { name: 'Copy as markdown' })).toHaveAttribute(
		'data-disabled'
	);
});

import { expect, test, type Page } from '@playwright/test';

/**
 * The table row menu, which only a real browser can show: a click on one of its
 * buttons moves focus out of the editor first, and whatever the editor does on
 * blur lands before the button's `click`.
 *
 * It exists because the note editor's blur handler collapsed the row grip's cell
 * selection, which closed the menu under the pointer — so Delete This Row did nothing.
 * The table commands themselves are covered without a browser in
 * `src/lib/components/edra/commands/table-editing.svelte.spec.ts`.
 */

/** A note of this test's own, so each run starts from one empty table. */
async function openNoteWithTable(page: Page): Promise<void> {
	await page.goto('/today');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	await noteLink.waitFor({ state: 'attached' });
	const openedFrom = (await noteLink.getAttribute('href'))!;
	await page.goto(openedFrom);
	await page.locator('[data-note-pane]').waitFor();
	await page.getByRole('button', { name: 'New note' }).click();
	await page.waitForURL((url) => url.pathname.startsWith('/notes/') && url.pathname !== openedFrom);
	// Reload on the new note alone: the note it was opened from stays mounted as a
	// hidden pane, and a second editor makes every locator below ambiguous.
	await page.goto(new URL(page.url()).pathname);
	const editor = page.locator('[data-note-pane] .tiptap');
	await expect(editor).toBeVisible();
	await editor.click();
	await page.keyboard.type('/table');
	await page.getByRole('button', { name: 'Table', exact: true }).click();
	await expect(page.locator('[data-note-pane] .tiptap table tr')).toHaveCount(3);
}

/**
 * Walks the pointer from the row's first cell onto its grip, as a hand would. The
 * grip only takes pointer events while a `mousemove` over its row marks it shown,
 * so a jump straight to its coordinates lands on the table wrapper instead. Its
 * position comes from the cell: the grip is rebuilt on every transaction, so a
 * handle on it goes stale.
 */
async function openRowMenu(page: Page, rowIndex: number): Promise<void> {
	const cell = page.locator('[data-note-pane] .tiptap table tr').nth(rowIndex).locator('td, th');
	// The grips only render while the selection is inside the table.
	await cell.first().click();
	const box = (await cell.first().boundingBox())!;
	const y = box.y + box.height / 2;
	// The grip is 0.8rem wide and sits flush against the cell's left edge.
	await page.mouse.move(box.x + box.width / 2, y);
	await page.mouse.move(box.x - 6, y, { steps: 8 });
	await page.mouse.down();
	await page.mouse.up();
	await expect(page.getByRole('button', { name: 'Delete This Row' })).toBeVisible();
}

test('Delete This Row removes the selected row', async ({ page }) => {
	await openNoteWithTable(page);
	await openRowMenu(page, 1);
	await page.getByRole('button', { name: 'Delete This Row' }).click();
	await expect(page.locator('[data-note-pane] .tiptap table tr')).toHaveCount(2);
});

test('Delete This Row on the last row removes the table', async ({ page }) => {
	await openNoteWithTable(page);
	for (const remaining of [2, 1]) {
		await openRowMenu(page, 0);
		await page.getByRole('button', { name: 'Delete This Row' }).click();
		await page
			.locator('[data-note-pane] .tiptap table tr')
			.nth(remaining)
			.waitFor({ state: 'detached' });
	}
	await openRowMenu(page, 0);
	await page.getByRole('button', { name: 'Delete This Row' }).click();
	await expect(page.locator('[data-note-pane] .tiptap table')).toHaveCount(0);
});

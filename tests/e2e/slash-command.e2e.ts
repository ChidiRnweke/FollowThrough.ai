import { expect, test, type Page } from '@playwright/test';

/**
 * The `/` menu, which only a real browser can show: it is a ProseMirror
 * suggestion plugin, so it depends on real typing, on the plugin's own anchoring,
 * and on the list mounting outside the Svelte component tree.
 *
 * It exists because the extension was a stub — `SlashCommand()` discarded its
 * component and returned an empty extension — so every command group in
 * `commands.ts` was unreachable. The filtering rules themselves are covered
 * without a browser in `slash-command-items.spec.ts`.
 */

/**
 * A note of this test's own. These tests insert blocks, so sharing one note would
 * leave each run reading the previous one's leftovers — which is exactly how the
 * first version of this file passed once and then failed.
 */
async function openFreshNote(page: Page): Promise<void> {
	await page.goto('/today');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	await noteLink.waitFor({ state: 'attached' });
	await page.goto((await noteLink.getAttribute('href'))!);
	await page.locator('[data-note-pane]').waitFor();
	await page.getByRole('button', { name: 'New note' }).click();
	await expect(page.locator('[data-note-pane] .tiptap')).toBeVisible();
}

const typeSlash = async (page: Page, query: string): Promise<void> => {
	const editor = page.locator('[data-note-pane] .tiptap').first();
	await editor.click();
	await page.keyboard.type(`/${query}`);
};

// Asserted on the first group rather than the diagram one: with no query every
// group is offered, and the list scrolls, so anything further down is a test of
// scroll position rather than of the menu opening.
test('typing / opens the block menu', async ({ page }) => {
	await openFreshNote(page);
	await typeSlash(page, '');
	await expect(page.getByText('Headings', { exact: true })).toBeVisible();
});

test('the block menu filters as the query is typed', async ({ page }) => {
	await openFreshNote(page);
	await typeSlash(page, 'mermaid');
	await expect(page.getByRole('button', { name: 'Mermaid Diagram' })).toBeVisible();
});

// The reason the menu was made real: a saved draw.io diagram had no way into a note.
test('the block menu offers a saved project diagram', async ({ page }) => {
	await openFreshNote(page);
	await typeSlash(page, 'project');
	await expect(page.getByRole('button', { name: 'Project diagram' })).toBeVisible();
});

test('choosing a block inserts it', async ({ page }) => {
	await openFreshNote(page);
	await typeSlash(page, 'mermaid');
	await page.getByRole('button', { name: 'Mermaid Diagram' }).click();
	await expect(page.locator('[data-note-pane] .diagram-node').first()).toBeVisible();
});

// The typed `/query` has to go: leaving it behind strands the text above the
// block the command just inserted.
test('choosing a block removes the typed query', async ({ page }) => {
	await openFreshNote(page);
	await typeSlash(page, 'mermaid');
	await page.getByRole('button', { name: 'Mermaid Diagram' }).click();
	await expect(page.locator('[data-note-pane] .tiptap')).not.toContainText('/mermaid');
});

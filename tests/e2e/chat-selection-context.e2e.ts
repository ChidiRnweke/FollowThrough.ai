import { expect, test, type Page } from '@playwright/test';

/**
 * Pinning a passage to the chat as context.
 *
 * The regression this guards is the one the feature was built to end: the selection used to
 * ride along invisibly, read out of the focused pane at the moment of sending. What the
 * agent read and what the composer showed could not be compared, so neither could be
 * trusted. These assertions are all about the chip — that highlighting alone raises one,
 * that asking turns it into a pin, and that two passages make two.
 *
 * Read-only against the note: it selects and asks, never edits and never sends.
 */

async function openFirstNote(page: Page): Promise<void> {
	await page.goto('/today');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	await noteLink.waitFor({ state: 'attached' });
	await page.goto((await noteLink.getAttribute('href'))!);
	await page.locator('[data-note-pane]').waitFor();
}

/** Selects `steps` characters forward from the start of paragraph `index`. */
async function selectFromParagraph(page: Page, steps: number, index = 0): Promise<string> {
	await page.locator('[data-note-pane] .tiptap p').nth(index).click();
	await page.keyboard.down('Shift');
	for (let step = 0; step < steps; step++) await page.keyboard.press('ArrowRight');
	await page.keyboard.up('Shift');
	return page.evaluate(() => window.getSelection()?.toString() ?? '');
}

/**
 * Pinned passages only — the open note rides along as its own auto-chip in the same row, and
 * counting that too would make every assertion here one off.
 */
const chips = (page: Page) =>
	page.getByLabel('Chat context').getByRole('button', {
		name: /^Remove the passage pinned from .* from context$/
	});

/** The ephemeral chip: attached because the text is highlighted, not because it was pinned. */
const liveChip = (page: Page) =>
	page.getByLabel('Chat context').getByLabel('Remove the current selection from context');

const askAboutSelection = (page: Page) =>
	page.getByRole('button', { name: 'Ask about this', exact: true }).click();

/** The composer only exists once the chat is on screen, and the live chip lives in it. */
const openDockedChat = (page: Page) =>
	page.getByRole('button', { name: 'Toggle chat panel' }).click();

/**
 * Opening the chat takes width from the editor column, so the paragraph the next selection
 * needs is still moving. Waiting on the chip the first ask produced is waiting for that
 * reflow to finish — the count is both the assertion's subject and the settle signal.
 */
async function pinnedCount(page: Page, count: number): Promise<void> {
	await expect(chips(page)).toHaveCount(count);
	await page.locator('[data-note-pane] .tiptap p').first().waitFor({ state: 'visible' });
}

test('asking about a selection pins it to the composer as a chip', async ({ page }) => {
	await openFirstNote(page);
	await selectFromParagraph(page, 12);
	await askAboutSelection(page);

	await expect(chips(page)).toHaveCount(1);
});

test('the pinned chip says how much of the note came along', async ({ page }) => {
	await openFirstNote(page);
	await selectFromParagraph(page, 12);
	await askAboutSelection(page);

	await expect(page.getByLabel('Chat context')).toContainText(/\d+ words?/);
});

/**
 * Pinning a second passage means asking twice without leaving the note, which only happens
 * above the docked-panel breakpoint (96rem). Narrower than that the chat is a whole page
 * away, the note goes with it, and the journey is a different one.
 */
test.describe('with the chat docked beside the note', () => {
	test.use({ viewport: { width: 1680, height: 900 } });

	test('two passages pin as two separate chips', async ({ page }) => {
		await openFirstNote(page);
		await selectFromParagraph(page, 8);
		await askAboutSelection(page);
		await pinnedCount(page, 1);

		await selectFromParagraph(page, 10, 1);
		await askAboutSelection(page);

		await expect(chips(page)).toHaveCount(2);
	});

	test('pinning the same passage twice leaves one chip', async ({ page }) => {
		await openFirstNote(page);
		await selectFromParagraph(page, 12);
		await askAboutSelection(page);
		await pinnedCount(page, 1);

		await selectFromParagraph(page, 12);
		await askAboutSelection(page);

		await expect(chips(page)).toHaveCount(1);
	});

	test('highlighting text attaches it without anyone asking', async ({ page }) => {
		await openFirstNote(page);
		await openDockedChat(page);
		await selectFromParagraph(page, 12);

		await expect(liveChip(page)).toBeVisible();
	});

	test('the highlighted passage is attached without being pinned', async ({ page }) => {
		await openFirstNote(page);
		await openDockedChat(page);
		await selectFromParagraph(page, 12);

		await expect(chips(page)).toHaveCount(0);
	});

	test('dismissing the highlighted passage detaches it', async ({ page }) => {
		await openFirstNote(page);
		await openDockedChat(page);
		await selectFromParagraph(page, 12);
		await liveChip(page).click();

		await expect(liveChip(page)).toHaveCount(0);
	});

	/**
	 * Pinning is the same passage said more firmly, so it replaces the live chip rather than
	 * joining it — one highlight, one chip.
	 */
	test('asking about the highlighted passage leaves only the pin', async ({ page }) => {
		await openFirstNote(page);
		await openDockedChat(page);
		await selectFromParagraph(page, 12);
		await askAboutSelection(page);
		await pinnedCount(page, 1);

		await expect(liveChip(page)).toHaveCount(0);
	});
});

test('dismissing the chip detaches the passage', async ({ page }) => {
	await openFirstNote(page);
	await selectFromParagraph(page, 12);
	await askAboutSelection(page);
	await chips(page).first().click();

	await expect(chips(page)).toHaveCount(0);
});

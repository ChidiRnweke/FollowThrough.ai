import { expect, test, type Page } from '@playwright/test';

/**
 * Drives the split-pane flow end-to-end through the URL:
 *
 *   1. Opens two notes in the workbench (sidebar navigation).
 *   2. Directs the URL to the split-on shape
 *      (`?tabs=<...>&split=<id>`) and asserts both panes render.
 *   3. Drags the divider with the mouse and asserts the left pane
 *      shrinks; reloads and asserts the split + ratio both come back.
 *   4. Clicks the × on the divider and asserts the URL collapses back
 *      to a single pane.
 *
 * The drag-to-split *gesture* (carrying the note id in the
 * `dataTransfer`) is covered by the `workspace-tabs.svelte.spec.ts`
 * unit tests.  This e2e covers URL plumbing, persistence, layout, and
 * the close affordance.
 */

async function openFirstNote(page: Page): Promise<string> {
	await page.goto('/');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	await noteLink.waitFor({ state: 'attached' });
	const href = (await noteLink.getAttribute('href'))!;
	await page.goto(href);
	await page.locator('[data-note-pane]').waitFor();
	return href;
}

async function findSecondNoteHref(page: Page, firstHref: string): Promise<string | null> {
	const alternative = page.locator(`a[href^="/notes/"]:not([href="${firstHref}"])`).first();
	return (await alternative.getAttribute('href')) ?? null;
}

test('a deep-link URL with ?split= renders both panes side by side', async ({ page }) => {
	const firstHref = await openFirstNote(page);
	const secondHref = await findSecondNoteHref(page, firstHref);
	test.skip(!secondHref, 'the dev database must seed at least two notes for this regression');

	const firstId = firstHref.replace('/notes/', '');
	const secondId = secondHref!.replace('/notes/', '');

	await page.goto(`/notes/${firstId}?tabs=${firstId},${secondId}&split=${secondId}`);

	// Both panes must mount: the primary pane (focused) and the split pane.
	await expect(page.locator(`[data-note-pane="${firstId}"]`)).toBeAttached();
	await expect(page.locator(`[data-note-pane="${secondId}"]`)).toBeAttached();

	// Both panes must be visible: the wrapper for each carries either
	// `block` (display:block) or no `.hidden` Tailwind class.  We use
	// `toBeVisible()` which checks actual computed render visibility.
	await expect(page.locator(`[data-note-pane="${firstId}"]`)).toBeVisible();
	await expect(page.locator(`[data-note-pane="${secondId}"]`)).toBeVisible();

	// The divider is a `role="separator"` element between them.
	const divider = page.getByRole('separator');
	await expect(divider).toBeVisible();

	// The URL retains the split param after the layout's $effect runs.
	await expect(page).toHaveURL(/&split=/);
});

test('dragging the divider resizes the panes and survives reload', async ({ page }) => {
	const firstHref = await openFirstNote(page);
	const secondHref = await findSecondNoteHref(page, firstHref);
	test.skip(!secondHref, 'the dev database must seed at least two notes for this regression');

	const firstId = firstHref.replace('/notes/', '');
	const secondId = secondHref!.replace('/notes/', '');

	await page.goto(`/notes/${firstId}?tabs=${firstId},${secondId}&split=${secondId}`);
	await expect(page.locator(`[data-note-pane="${secondId}"]`)).toBeVisible();

	const divider = page.getByRole('separator');
	const dividerBox = (await divider.boundingBox())!;

	// Capture the primary pane's width before dragging.
	const primaryPane = page.locator(`[data-note-pane="${firstId}"]`);
	const primaryBoxBefore = (await primaryPane.boundingBox())!;

	// Drag the divider leftward by 200px (from its current x to x - 200).
	const startX = dividerBox.x + dividerBox.width / 2;
	const targetX = startX - 200;
	await page.mouse.move(startX, dividerBox.y);
	await page.mouse.down();
	// Move in two steps so the pointermove handler has time to fire on
	// intermediate positions — that's what triggers `setSplitRatio`.
	await page.mouse.move(targetX, dividerBox.y, { steps: 10 });
	await page.mouse.up();

	// The primary pane's width must shrink after the drag.
	const primaryBoxAfter = (await primaryPane.boundingBox())!;
	expect(primaryBoxAfter.width).toBeLessThan(primaryBoxBefore.width);

	// Reload and assert: the URL still carries the split, and the
	// primary pane's width is the smaller (post-drag) value, not 50%.
	await page.reload();
	await expect(page.locator(`[data-note-pane="${secondId}"]`)).toBeVisible();
	await expect(page).toHaveURL(/&split=/);

	const primaryBoxReloaded = (await primaryPane.boundingBox())!;
	expect(primaryBoxReloaded.width).toBeLessThan(primaryBoxBefore.width - 100);
});

test('clicking the × on the divider closes the split and rewrites the URL', async ({ page }) => {
	const firstHref = await openFirstNote(page);
	const secondHref = await findSecondNoteHref(page, firstHref);
	test.skip(!secondHref, 'the dev database must seed at least two notes for this regression');

	const firstId = firstHref.replace('/notes/', '');
	const secondId = secondHref!.replace('/notes/', '');

	await page.goto(`/notes/${firstId}?tabs=${firstId},${secondId}&split=${secondId}`);
	await expect(page.locator(`[data-note-pane="${secondId}"]`)).toBeVisible();

	const closeButton = page.getByRole('button', { name: 'Close split pane' });
	await closeButton.click();

	// URL no longer carries the split param.
	await expect(page).not.toHaveURL(/&split=/);

	// The primary pane remains visible; the split wrapper goes `hidden`.
	await expect(page.locator(`[data-note-pane="${firstId}"]`)).toBeVisible();
	await expect(page.locator(`[data-note-pane="${secondId}"]`)).toBeHidden();
});
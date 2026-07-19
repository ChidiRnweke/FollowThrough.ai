import { expect, test, type Page } from '@playwright/test';

type ProbeWindow = Window & { __paneMounts?: number[] };

/**
 * Installs a MutationObserver that records the timestamp of every
 * `[data-note-pane]` mount.  The probe is installed before hydration so
 * the initial mounts are captured.
 */
async function installPaneMountProbe(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const probeWindow = window as ProbeWindow;
		probeWindow.__paneMounts = [];
		new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node instanceof HTMLElement && node.getAttribute('data-note-pane')) {
						probeWindow.__paneMounts!.push(Date.now());
					}
				}
			}
		}).observe(document.body, { childList: true, subtree: true });
	});
}

async function readPaneMounts(page: Page): Promise<number> {
	return page.evaluate(() => (window as ProbeWindow).__paneMounts?.length ?? 0);
}

async function openFirstNote(page: Page): Promise<string> {
	await page.goto('/');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	await noteLink.waitFor({ state: 'attached' });
	const href = (await noteLink.getAttribute('href'))!;
	await page.goto(href);
	await page.locator('[data-note-pane]').waitFor();
	return href;
}

test('switching workbench tabs does not remount the editor', async ({ page }) => {
	await installPaneMountProbe(page);
	const firstHref = await openFirstNote(page);

	// Find another openable note in the sidebar (different from the focused one).
	const alternativeHref =
		(await page
			.locator(`a[href^="/notes/"]:not([href="${firstHref}"])`)
			.first()
			.getAttribute('href')) ?? null;
	test.skip(!alternativeHref, 'the dev database must seed at least two notes for this regression');

	// Open the second note via the sidebar — this calls `workbench.openTab`
	// in the app, preserving the first tab.
	await page.locator(`a[href="${alternativeHref}"]`).first().click();
	const secondNoteId = alternativeHref!.replace('/notes/', '');
	await page.locator(`[data-note-pane="${secondNoteId}"]`).waitFor();

	const mountsAfterOpen = await readPaneMounts(page);
	expect(mountsAfterOpen).toBe(2);

	// Switch to the first tab via the tab strip and assert no remount occurs.
	// The tab strip's `<button role="tab">` carries the note title in its
	// `title` attribute; we match by reading the focused pane's title from
	// the active tab's `aria-selected="true"` state and clicking the other one.
	const tabs = page.locator('button[role="tab"]');
	await expect(tabs).toHaveCount(2);

	// Click the inactive tab (the one whose `aria-selected` is "false").
	await page.locator('button[role="tab"][aria-selected="false"]').click();
	const firstNoteId = firstHref.replace('/notes/', '');
	await page
		.locator(
			`[data-note-pane="${firstNoteId}"][style*="block"], [data-note-pane="${firstNoteId}"]:not(.hidden)`
		)
		.first()
		.waitFor();

	// Switch back to the second tab.
	await page.locator('button[role="tab"][aria-selected="false"]').click();
	await page.locator(`[data-note-pane="${secondNoteId}"]:not(.hidden)`).first().waitFor();

	// One more round-trip to be sure.
	await page.locator('button[role="tab"][aria-selected="false"]').click();
	await page.locator(`[data-note-pane="${firstNoteId}"]:not(.hidden)`).first().waitFor();

	const mountsAfterSwitches = await readPaneMounts(page);
	expect(mountsAfterSwitches).toBe(2);
});

test('the tab strip stays visible while the editor scrolls', async ({ page }) => {
	await openFirstNote(page);
	const tabStrip = page.locator('[role="tablist"][aria-label="Open notes"]');
	await expect(tabStrip).toBeVisible();
	await expect(tabStrip).toHaveCSS('position', 'sticky');

	// Scroll the editor surface downward and confirm the tab strip is still
	// visible and pinned.
	await page
		.locator('[data-note-pane]')
		.first()
		.evaluate((el) => el.scrollTo(0, 800));
	await expect(tabStrip).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';

type ProbeWindow = Window & {
	__paneMounts?: number[];
	__navigationProgressMaxOpacity?: number;
};

async function installNavigationProgressProbe(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const probeWindow = window as ProbeWindow;
		probeWindow.__navigationProgressMaxOpacity = 0;
		const sample = () => {
			const indicator = document.querySelector<HTMLElement>('[data-navigation-progress]');
			if (indicator) {
				probeWindow.__navigationProgressMaxOpacity = Math.max(
					probeWindow.__navigationProgressMaxOpacity ?? 0,
					Number.parseFloat(getComputedStyle(indicator).opacity)
				);
			}
			requestAnimationFrame(sample);
		};
		requestAnimationFrame(sample);
	});
}

async function navigationProgressWasRevealed(page: Page): Promise<boolean> {
	return page.evaluate(() => ((window as ProbeWindow).__navigationProgressMaxOpacity ?? 0) > 0);
}

async function resetNavigationProgressProbe(page: Page): Promise<void> {
	await page.evaluate(() => {
		(window as ProbeWindow).__navigationProgressMaxOpacity = 0;
	});
}

async function cacheDataRequest(page: Page, pathname: string): Promise<void> {
	let cachedResponse: { body: Buffer; headers: Record<string, string>; status: number } | undefined;
	await page.route(`**${pathname}/__data.json*`, async (route) => {
		if (!cachedResponse) {
			const response = await route.fetch();
			cachedResponse = {
				body: await response.body(),
				headers: response.headers(),
				status: response.status()
			};
		}
		await route.fulfill(cachedResponse);
	});
}

async function delayDataRequest(page: Page, pathname: string, delayMs: number): Promise<void> {
	await page.route(`**${pathname}/__data.json*`, async (route) => {
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		await route.continue();
	});
}

/**
 * Installs a MutationObserver that records the timestamp of every
 * `[data-note-pane]` mount.  The probe is installed before hydration so
 * the initial mounts are captured.
 */
async function installPaneMountProbe(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const probeWindow = window as ProbeWindow;
		probeWindow.__paneMounts = [];
		const seenPanes = new WeakSet<Element>();
		const sample = () => {
			for (const pane of document.querySelectorAll('[data-note-pane]')) {
				if (seenPanes.has(pane)) continue;
				seenPanes.add(pane);
				probeWindow.__paneMounts!.push(Date.now());
			}
			requestAnimationFrame(sample);
		};
		requestAnimationFrame(sample);
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

test('a todo-to-note navigation finishing within the micro-duration never reveals progress', async ({
	page
}) => {
	await installNavigationProgressProbe(page);
	await page.goto('/todos');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	const pathname = (await noteLink.getAttribute('href'))!;
	await cacheDataRequest(page, pathname);
	await noteLink.click();
	await page.locator('[data-note-pane]').waitFor();
	await page.goto('/todos');
	await resetNavigationProgressProbe(page);
	await page.locator(`a[href="${pathname}"]`).first().click();
	await page.locator('[data-note-pane]').waitFor();

	expect(await navigationProgressWasRevealed(page)).toBe(false);
});

test('a slow todo-to-note navigation reveals progress and removes it after completion', async ({
	page
}) => {
	await installNavigationProgressProbe(page);
	await page.goto('/todos');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	const pathname = (await noteLink.getAttribute('href'))!;
	await delayDataRequest(page, pathname, 250);
	await noteLink.click();
	await page.locator('[data-note-pane]').waitFor();

	expect({
		revealed: await navigationProgressWasRevealed(page),
		removed: (await page.locator('[data-navigation-progress]').count()) === 0
	}).toEqual({ revealed: true, removed: true });
});

test('a slow note-to-note navigation keeps progress suppressed', async ({ page }) => {
	await installNavigationProgressProbe(page);
	const firstHref = await openFirstNote(page);
	const alternative = page.locator(`a[href^="/notes/"]:not([href="${firstHref}"])`).first();
	const alternativeHref = await alternative.getAttribute('href');
	test.skip(!alternativeHref, 'the dev database must seed at least two notes for this regression');
	await delayDataRequest(page, alternativeHref!, 250);
	await alternative.click();
	await page.locator(`[data-note-pane="${alternativeHref!.replace('/notes/', '')}"]`).waitFor();

	expect(await navigationProgressWasRevealed(page)).toBe(false);
});

test('a slow non-note navigation still reveals progress', async ({ page }) => {
	await installNavigationProgressProbe(page);
	await openFirstNote(page);
	await delayDataRequest(page, '/todos', 250);
	await page.locator('a[href="/todos"]').first().click();
	await page.waitForURL(/\/todos$/);

	expect({
		revealed: await navigationProgressWasRevealed(page),
		removed: (await page.locator('[data-navigation-progress]').count()) === 0
	}).toEqual({ revealed: true, removed: true });
});

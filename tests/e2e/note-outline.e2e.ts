import { expect, test, type Page } from '@playwright/test';

/**
 * The outline rail's behaviour that only a real browser can show: it depends on
 * the pane's own width, on the ScrollArea viewport actually scrolling, and — the
 * regression this file exists for — on each pane owning its own outline.
 *
 * The rail used to be a module-level singleton (`edra/toc.svelte`), which meant
 * a split view showed whichever pane updated last in both. The rendering rules
 * themselves (ticks, labels, numbering, `aria-current`) are covered without a
 * browser in `note-outline-rail.svelte.spec.ts`.
 */

/** Comfortably past the rail's 122ch container threshold, even when halved. */
const WIDE = { width: 2880, height: 1100 };

/**
 * A hard navigation against a cold dev server can abort while Vite is still
 * compiling the route it was asked for. Retry once rather than let the first
 * test in the file carry the warm-up cost as a failure.
 */
async function gotoStable(page: Page, url: string): Promise<void> {
	for (let attempt = 0; ; attempt += 1) {
		try {
			await page.goto(url, { waitUntil: 'domcontentloaded' });
			return;
		} catch (error) {
			if (attempt > 0 || !String(error).includes('ERR_ABORTED')) throw error;
		}
	}
}

async function openNoteWithHeadings(page: Page): Promise<string> {
	// `domcontentloaded` rather than `load`: the shell keeps fetching after the
	// markup lands, and navigating away mid-fetch aborts the pending navigation.
	await gotoStable(page, '/today');
	const noteLink = page.locator('a[href^="/notes/"]').first();
	await noteLink.waitFor({ state: 'attached' });
	const href = (await noteLink.getAttribute('href'))!;
	await gotoStable(page, href);
	await page.locator('[data-note-pane]').waitFor();
	return href;
}

async function findSecondNoteHref(page: Page, firstHref: string): Promise<string | null> {
	const alternative = page.locator(`a[href^="/notes/"]:not([href="${firstHref}"])`).first();
	return (await alternative.getAttribute('href')) ?? null;
}

test('each pane in a split keeps its own outline', async ({ page }) => {
	await page.setViewportSize(WIDE);
	// Straight from the note list to the split URL: opening one note first only
	// adds a navigation to race against a cold dev server, and the split deep
	// link mounts both panes by itself.
	await gotoStable(page, '/today');
	const firstLink = page.locator('a[href^="/notes/"]').first();
	await firstLink.waitFor({ state: 'attached' });
	const firstHref = (await firstLink.getAttribute('href'))!;
	const secondHref = await findSecondNoteHref(page, firstHref);
	test.skip(!secondHref, 'the dev database must seed at least two notes for this regression');

	const firstId = firstHref.replace('/notes/', '');
	const secondId = secondHref!.replace('/notes/', '');
	await gotoStable(page, `/notes/${firstId}?tabs=${firstId},${secondId}&split=${secondId}`);

	const primary = page.locator(".workspace-pane-layer[data-pane-role='primary']");
	const split = page.locator(".workspace-pane-layer[data-pane-role='split']");
	await primary.locator('[data-note-pane]').waitFor();
	await split.locator('[data-note-pane]').waitFor();

	// Compare each rail against the headings in its *own* pane rather than against
	// the other rail: that holds whatever the dev database happens to seed, and it
	// is precisely what a shared outline would get wrong.
	const eligibleRailsMatchTheirOwnPane = async () =>
		page.evaluate(() => {
			const panes = [...document.querySelectorAll('.workspace-pane-layer')]
				.filter((pane) => getComputedStyle(pane).display !== 'none')
				.map((pane) => ({
					headings: [...pane.querySelectorAll('.tiptap [data-toc-id]')]
						.map((heading) => (heading.textContent ?? '').trim())
						.filter(Boolean),
					rail: [...pane.querySelectorAll('.note-outline-list button')].map(
						(button) => button.querySelector('.truncate')?.textContent?.trim() ?? ''
					)
				}));
			// Each pane with at least two written headings is eligible for a rail.
			// Keep empty and incomplete rails in the result so either regression fails.
			const eligible = panes.filter((pane) => pane.headings.length > 1);
			return {
				eligibleCount: eligible.length,
				matches: eligible.map(
					(pane) =>
						pane.rail.length > 0 && JSON.stringify(pane.rail) === JSON.stringify(pane.headings)
				)
			};
		});

	const observed = await eligibleRailsMatchTheirOwnPane();
	test.skip(
		observed.eligibleCount !== 2,
		'the dev database must seed two split notes with at least two nonempty headings each'
	);
	await expect.poll(eligibleRailsMatchTheirOwnPane).toEqual({
		eligibleCount: 2,
		matches: [true, true]
	});
});

test('the lit tick follows the reader down the note', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await openNoteWithHeadings(page);

	const ticks = page.locator('.note-outline-ticks li');
	await ticks.first().waitFor();
	test.skip((await ticks.count()) < 3, 'this note is too short to scroll between sections');

	const lit = page.locator('.note-outline-ticks li[data-active="true"]');
	const indexOfLit = () =>
		lit.first().evaluate((el) => [...(el.parentElement?.children ?? [])].indexOf(el));

	const before = await indexOfLit();
	await page
		.locator('[data-slot="scroll-area-viewport"]')
		.first()
		.evaluate((el) => {
			el.scrollTop = el.scrollHeight / 2;
		});
	await expect.poll(indexOfLit).toBeGreaterThan(before);
});

test('the rail yields the gutter when the pane is too narrow to hold it', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await openNoteWithHeadings(page);
	const rail = page.locator('.note-outline').first();
	await expect(rail).toBeAttached();

	await page.setViewportSize({ width: 900, height: 900 });
	await expect(rail).toHaveCSS('display', 'none');
});

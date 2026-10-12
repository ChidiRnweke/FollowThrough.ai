import { mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import postgres from 'postgres';
import {
	screenshotFile,
	screenshotIds,
	screenshotThemes,
	type ScreenshotId,
	type ScreenshotTheme
} from '../src/lib/components/marketing/screenshots.ts';
import { mintSession } from '../tests/auth.setup.ts';
import { scenes } from './capture-screenshots/scenes.ts';
import { resetShowcase, seedShowcase, SHOWCASE_USER_ID } from './capture-screenshots/showcase.ts';

/**
 * Regenerate every product screenshot from a seeded workspace.
 *
 *     pnpm dev                    # with the real .env: the model picker reads the live catalog
 *     pnpm docs:screenshots       # or: pnpm docs:screenshots --only today-screen,tools --cleanup
 *
 * The run signs in as a dedicated showcase user, never as you. It deletes and re-creates that
 * user's workspace, so reruns start from the same state, and `--cleanup` removes the user when
 * the captures are done. Images land in `static/product-screenshots/`, the one folder the
 * README, the docs site and the marketing page all read from.
 */

const { values: options } = parseArgs({
	options: {
		'base-url': { type: 'string', default: 'http://127.0.0.1:5173' },
		only: { type: 'string' },
		cleanup: { type: 'boolean', default: false }
	}
});

const baseUrl = options['base-url'];
const output = new URL('../static/product-screenshots/', import.meta.url);

const isScreenshotId = (value: string): value is ScreenshotId =>
	screenshotIds.some((id) => id === value);

const selected = (): readonly ScreenshotId[] => {
	if (!options.only) return screenshotIds;
	const requested = options.only.split(',').map((value) => value.trim());
	const unknownIds = requested.filter((value) => !isScreenshotId(value));
	if (unknownIds.length > 0) throw new Error(`Unknown screenshot ids: ${unknownIds.join(', ')}.`);
	return requested.filter(isScreenshotId);
};

const requestedIds = selected();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the showcase workspace.');

const openContext = async (
	browser: Browser,
	token: string,
	theme: ScreenshotTheme,
	viewport: { readonly width: number; readonly height: number }
): Promise<BrowserContext> => {
	const context = await browser.newContext({
		viewport,
		deviceScaleFactor: 2,
		// Not `reducedMotion: 'reduce'`: under it the app lays a Mermaid diagram out wider than
		// its frame and clips the right edge. The scenes wait for motion to settle instead.
		colorScheme: theme
	});
	await context.addCookies([
		{ name: 'session', value: token, domain: new URL(baseUrl).hostname, path: '/' }
	]);
	// mode-watcher persists the theme here; set it so no earlier choice can leak in.
	await context.addInitScript((mode) => localStorage.setItem('mode-watcher-mode', mode), theme);
	return context;
};

const sql = postgres(databaseUrl, { max: 1 });
const browser = await chromium.launch();
try {
	await resetShowcase(sql);
	const token = await mintSession(sql, SHOWCASE_USER_ID);

	const seeding = await openContext(browser, token, 'light', { width: 1440, height: 900 });
	const seedPage = await seeding.newPage();
	// The first load provisions the Inbox and the built-in skills.
	await seedPage.goto(`${baseUrl}/today`);
	await seedPage.getByRole('heading', { name: 'Today', exact: true }).waitFor();
	const ids = await seedShowcase(sql, seedPage, baseUrl);
	await seeding.close();

	await mkdir(output, { recursive: true });
	for (const id of requestedIds) {
		const scene = scenes[id];
		for (const theme of screenshotThemes) {
			const context = await openContext(browser, token, theme, scene.viewport);
			const page = await context.newPage();
			await page.goto(`${baseUrl}${scene.path(ids)}`);
			await scene.ready(page, ids);
			await page.evaluate(() => document.fonts.ready);
			if (scene.pointer !== 'stay') await page.mouse.move(0, scene.viewport.height - 1);
			// Transitions finish before the shot; an infinite animation (a spinner) never does.
			await page.waitForFunction(() =>
				document
					.getAnimations()
					.every(
						(animation) =>
							animation.playState !== 'running' ||
							animation.effect?.getTiming().iterations === Infinity
					)
			);
			const path = new URL(screenshotFile(id, theme), output).pathname;
			const shot = { path, type: 'jpeg', quality: 80 } as const;
			if (scene.region) await scene.region(page).screenshot(shot);
			else await page.screenshot(shot);
			process.stdout.write(`${path}\n`);
			await context.close();
		}
	}

	if (options.cleanup) await sql`delete from users where id = ${SHOWCASE_USER_ID}`;
} finally {
	await browser.close();
	await sql.end();
}

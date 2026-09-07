import { expect, test, type Page } from '@playwright/test';

const waitForServiceWorker = async (page: Page): Promise<void> => {
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller)
			await new Promise<void>((resolve) =>
				navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
					once: true
				})
			);
	});
};

/** The note's title lives in the breadcrumb's current-page segment. */
const noteTitleCrumb = (page: Page) =>
	page
		.locator('[data-note-pane]:visible')
		.first()
		.getByRole('navigation', { name: 'breadcrumb' })
		.locator('[aria-current="page"]');

test('exposes installable FollowThrough metadata', async ({ page, context }) => {
	await page.goto('/today');
	const session = await context.newCDPSession(page);
	const manifest = await session.send('Page.getAppManifest');
	expect({
		errors: manifest.errors,
		containsName: manifest.data?.includes('FollowThrough')
	}).toEqual({
		errors: [],
		containsName: true
	});
});

test('registers a service worker for the workspace', async ({ page }) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	expect(
		await page.evaluate(() =>
			navigator.serviceWorker.controller?.scriptURL.endsWith('/service-worker.js')
		)
	).toBe(true);
});

test('reopens a visited note from the cached workspace while offline', async ({
	page,
	context
}) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	const noteLink = page.locator('a[href^="/notes/"]').first();
	const noteTitle = (await noteLink.textContent())?.trim();
	if (!noteTitle) throw new Error('A note is required for the offline workspace test');
	await noteLink.click();
	await noteTitleCrumb(page).waitFor();
	await page.goto('/today');
	await context.setOffline(true);
	await page.reload();
	await page.getByRole('link', { name: noteTitle, exact: true }).click();
	await expect(noteTitleCrumb(page)).toHaveText(noteTitle);
});

test('uses the offline fallback for an uncached route', async ({ page, context }) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	await context.setOffline(true);
	await page.goto(`/uncached-${crypto.randomUUID()}`);
	expect(page.url()).toMatch(/\/offline$/);
});

test('keeps remote functions and API responses out of Cache Storage', async ({ page }) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	const cachedUrls = await page.evaluate(async () => {
		const urls: string[] = [];
		for (const name of await caches.keys()) {
			for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
		}
		return urls;
	});
	expect(cachedUrls.some((url) => url.includes('/_app/remote/') || url.includes('/api/'))).toBe(
		false
	);
});

test('opens an unvisited cached note URL after going offline', async ({ page, context }) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	const link = page.locator('a[href^="/notes/"]').first();
	const href = await link.getAttribute('href');
	const title = (await link.textContent())?.trim();
	if (!href || !title) throw new Error('A synchronized note is required');
	await context.setOffline(true);
	await page.goto(href);
	await expect(noteTitleCrumb(page)).toHaveText(title);
});

test('retains an offline task through reload and submits it on reconnect', async ({
	page,
	context
}) => {
	await page.goto('/todos?view=board&quickTodo');
	await waitForServiceWorker(page);
	const title = `Offline task ${crypto.randomUUID()}`;
	await context.setOffline(true);
	await page.locator('#quick-todo-input').fill(title);
	await page.locator('#quick-todo-input').press('Enter');
	await page.getByText(title, { exact: true }).first().waitFor();
	await page.reload();
	await page.getByText(title, { exact: true }).first().waitFor();
	const pushed = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			response.url().endsWith('/pushWorkspaceMutation') &&
			response.ok()
	);
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	expect(await (await pushed).text()).toContain('applied');
});

test('stores no private page snapshots or page data', async ({ page }) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	const privateCaches = await page.evaluate(async () => {
		const names = await caches.keys();
		const urls = (
			await Promise.all(
				names.map(async (name) =>
					(await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname)
				)
			)
		).flat();
		return {
			oldPageCache: names.some((name) => name.startsWith('followthrough-pages-')),
			privatePage: urls.some((path) => /^\/(today|notes|todos|projects)(?:\/|$)/.test(path)),
			pageData: urls.some((path) => path.includes('__data.json')),
			generatedShell: urls.includes('/offline-shell.html')
		};
	});
	expect(privateCaches).toEqual({
		oldPageCache: false,
		privatePage: false,
		pageData: false,
		generatedShell: true
	});
});

test('creates a project and note offline with stable links through reload and reconnect', async ({
	page,
	context
}) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	await context.setOffline(true);
	const projectName = `Offline project ${crypto.randomUUID()}`;
	const noteName = `Offline note ${crypto.randomUUID()}`;
	await page.getByRole('button', { name: 'New project', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('textbox', { name: 'Project name' }).fill(projectName);
	await dialog.getByRole('button', { name: 'Create', exact: true }).click();
	await page.getByRole('heading', { name: projectName, exact: true }).waitFor();
	await page.getByRole('button', { name: 'New note', exact: true }).last().click();
	await dialog.getByRole('textbox', { name: 'Note title' }).fill(noteName);
	await dialog.getByRole('button', { name: 'Create', exact: true }).click();
	await noteTitleCrumb(page).filter({ hasText: noteName }).waitFor();
	const noteUrl = page.url();
	await page.reload();
	await noteTitleCrumb(page).filter({ hasText: noteName }).waitFor();
	const acknowledgments: string[] = [];
	page.on('response', async (response) => {
		if (response.url().endsWith('/pushWorkspaceMutation') && response.ok())
			acknowledgments.push(await response.text());
	});
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect
		.poll(() => ({
			url: page.url(),
			acknowledged: acknowledgments.filter((body) => body.includes('applied')).length
		}))
		.toEqual({ url: noteUrl, acknowledged: 2 });
});

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

test('exposes installable FollowThrough metadata', async ({ page, context }) => {
	await page.goto('/');
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
	await page.goto('/');
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
	await page.goto('/');
	await waitForServiceWorker(page);
	const noteLink = page.locator('a[href^="/notes/"]').first();
	const noteTitle = (await noteLink.textContent())?.trim();
	if (!noteTitle) throw new Error('A note is required for the offline workspace test');
	await noteLink.click();
	await page.getByLabel('Note title').waitFor();
	await page.goto('/');
	await context.setOffline(true);
	await page.reload();
	await page.getByRole('link', { name: noteTitle, exact: true }).click();
	expect(await page.getByLabel('Note title').inputValue()).toBe(noteTitle);
});

test('uses the offline fallback for an uncached route', async ({ page, context }) => {
	await page.goto('/');
	await waitForServiceWorker(page);
	await context.setOffline(true);
	await page.goto(`/uncached-${crypto.randomUUID()}`);
	expect(page.url()).toMatch(/\/offline$/);
});

test('keeps remote functions and API responses out of Cache Storage', async ({ page }) => {
	await page.goto('/');
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

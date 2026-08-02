import { expect, test, type Page } from '@playwright/test';

/**
 * Capability smoke: one representative journey per application surface. This is
 * the retained e2e layer — every detail below these landmarks belongs in a
 * component or unit test (see docs/TEST_MANIFEST.md). Boundary: client-server
 * wiring across capabilities; asserts each primary landmark renders without
 * browser errors.
 */

const pageErrors: string[] = [];

const visit = async (
	page: Page,
	pathname: string,
	heading: RegExp | string
): Promise<void> => {
	await page.goto(pathname);
	await expect(page.getByRole('heading', { name: heading })).toBeVisible();
};

test.beforeEach(async ({ page }) => {
	pageErrors.length = 0;
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') pageErrors.push(message.text());
	});
});

test('the capability smoke covers every application surface', async ({ page }) => {
	await visit(page, '/today', 'Today');

	const noteLink = page.locator('a[href^="/notes/"]').first();
	await noteLink.waitFor({ state: 'attached' });
	await page.goto((await noteLink.getAttribute('href'))!);
	await page.locator('[data-note-pane]').waitFor({ timeout: 20_000 });

	await visit(page, '/todos', 'Todos');
	await visit(page, '/chats', /Chats/);
	await visit(page, '/skills', 'Skills');
	await visit(page, '/settings', 'Settings');

	const projectLink = page.locator('a[href^="/projects/"]').first();
	await projectLink.waitFor({ state: 'attached' });
	const projectHref = (await projectLink.getAttribute('href'))!;
	await page.goto(projectHref);
	await expect(page.locator('h1')).toBeVisible();

	// Memory and attachments exist only under a project; the other surfaces
	// (notes, todos, chats, skills, settings) are covered by their global routes.
	await page.goto(`${projectHref}/memory`);
	await expect(page.getByRole('heading', { name: 'Memory' })).toBeVisible();
	await page.goto(`${projectHref}/attachments`);
	await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible();

	await page.goto('/artifacts');
	await expect(page.getByRole('heading', { name: 'Artifacts' })).toBeVisible();

	expect(pageErrors).toEqual([]);
});

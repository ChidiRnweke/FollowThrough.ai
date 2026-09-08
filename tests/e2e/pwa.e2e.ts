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

test('opens collection and settings routes offline without server page data', async ({
	page,
	context
}) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	await context.setOffline(true);
	const headings: string[] = [];
	for (const route of ['/skills', '/trash', '/settings?tab=tools']) {
		await page.goto(route);
		const heading = page.getByRole('heading', { level: 1 });
		await heading.waitFor();
		headings.push((await heading.textContent())?.trim() ?? '');
	}
	expect(headings).toEqual(['Skills', 'Trash', 'Settings']);
});

test('opens saved chat history offline and disables execution', async ({ page, context }) => {
	await page.goto('/chats');
	await waitForServiceWorker(page);
	await page.getByRole('button', { name: /^Saved synchronization chat Workspace chat/ }).click();
	await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
	const href = page.url();
	await context.setOffline(true);
	await page.goto(href);
	await page
		.getByText(
			'Offline. Saved chat history is available. Reconnect to send messages or answer approvals.'
		)
		.waitFor();
	await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
});

test('reviews and discards an offline project without losing unreviewed work', async ({
	page,
	context
}, testInfo) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	await context.setOffline(true);
	await page.getByRole('button', { name: 'New project', exact: true }).click();
	const creation = page.getByRole('dialog');
	await creation.getByRole('textbox', { name: 'Project name' }).fill('Offline review project');
	await creation.getByRole('button', { name: 'Create', exact: true }).click();
	await page.getByRole('heading', { name: 'Offline review project', exact: true }).waitFor();
	await page.goto('/today');
	await page.getByRole('button', { name: 'Review changes', exact: true }).waitFor();
	await page.screenshot({ path: testInfo.outputPath('saved-offline-project.png'), fullPage: true });
	await page.getByRole('button', { name: 'Review changes', exact: true }).click();
	await page.getByRole('button', { name: 'Review', exact: true }).click();
	await page.getByRole('heading', { name: 'Your change', exact: true }).waitFor();
	await page.screenshot({
		path: testInfo.outputPath('review-offline-project.png'),
		fullPage: true
	});
	await page.getByRole('button', { name: 'Discard local change', exact: true }).click();
	await expect(page.getByText('No changes are waiting to send.')).toBeVisible();
});

test('retains an offline note edit and publishes it after reconnecting', async ({
	page,
	context
}) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	await page.locator('a[href^="/notes/"]:visible').first().click();
	const body = page.getByLabel('Note body', { exact: true });
	await body.waitFor();
	await context.setOffline(true);
	await body.fill('An offline edit retained through publication.');
	await page.getByRole('button', { name: 'Publish note (Ctrl+S, S)', exact: true }).click();
	await page.getByText('Publication saved on this device', { exact: true }).waitFor();
	await page.reload();
	await body.waitFor();
	const retained = await body.textContent();
	const acknowledgments: string[] = [];
	page.on('response', async (response) => {
		if (response.url().endsWith('/pushWorkspaceMutation') && response.ok())
			acknowledgments.push(await response.text());
	});
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect
		.poll(() => ({
			retained,
			applied: acknowledgments.filter((text) => text.includes('applied')).length
		}))
		.toEqual({ retained: 'An offline edit retained through publication.', applied: 2 });
});

test('refreshes another tab’s offline changes when returning to the app', async ({
	page,
	context
}) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	const other = await context.newPage();
	await other.goto('/today');
	await other.getByRole('button', { name: 'New project', exact: true }).waitFor();
	await context.setOffline(true);
	const name = `Shared offline project ${crypto.randomUUID()}`;
	await page.getByRole('button', { name: 'New project', exact: true }).click();
	const creation = page.getByRole('dialog');
	await creation.getByRole('textbox', { name: 'Project name' }).fill(name);
	await creation.getByRole('button', { name: 'Create', exact: true }).click();
	await page.getByRole('heading', { name, exact: true }).waitFor();
	await other.bringToFront();
	await other.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect(other.getByRole('link', { name, exact: true }).first()).toBeVisible();
});

test('moves a note to trash and restores it offline through reload', async ({ page, context }) => {
	await page.goto('/today');
	await waitForServiceWorker(page);
	await page.locator('a[href^="/notes/"]:visible').first().click();
	await page.getByLabel('Note body', { exact: true }).waitFor();
	const href = page.url();
	const title = (await noteTitleCrumb(page).textContent())?.trim();
	if (!title) throw new Error('The seeded note must have a title');
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Note actions', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Move to trash', exact: true }).click();
	await page.getByText('Moved to trash', { exact: true }).waitFor();
	await page.goto('/trash');
	await page.reload();
	await page
		.getByRole('listitem')
		.filter({ hasText: title })
		.getByRole('button', { name: 'Restore', exact: true })
		.click();
	await page.getByText('Restored', { exact: true }).waitFor();
	await page.goto(href);
	await expect(page.getByLabel('Note body', { exact: true })).toBeVisible();
});

test('archives, restores, and deletes a saved diagram offline', async ({
	page,
	context
}, testInfo) => {
	const title = 'Saved synchronization diagram';
	const gallery = '/diagrams?projectId=00000000-0000-4000-8000-000000000002';
	await page.goto(gallery);
	await waitForServiceWorker(page);
	await page.getByRole('link', { name: title, exact: true }).last().waitFor();
	await context.setOffline(true);
	await page.screenshot({ path: testInfo.outputPath('diagram-saved-offline.png'), fullPage: true });
	const archive = async () => {
		await page.getByRole('link', { name: title, exact: true }).last().hover();
		await page.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
		await page.getByRole('menuitem', { name: 'Move to trash', exact: true }).click();
		await page
			.getByRole('alertdialog')
			.getByRole('button', { name: 'Move to trash', exact: true })
			.click();
		await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
		await page.goto('/trash');
		await page.getByRole('listitem').filter({ hasText: title }).waitFor();
	};
	await archive();
	await page.screenshot({
		path: testInfo.outputPath('diagram-trashed-offline.png'),
		fullPage: true
	});
	await page.reload();
	await page
		.getByRole('listitem')
		.filter({ hasText: title })
		.getByRole('button', { name: 'Restore', exact: true })
		.click();
	await page.getByText('Restored', { exact: true }).waitFor();
	await page.goto(gallery);
	await archive();
	await page.getByRole('button', { name: `Delete ${title} forever`, exact: true }).click();
	await page
		.getByRole('alertdialog')
		.getByRole('button', { name: 'Delete forever', exact: true })
		.click();
	await page.getByText('Deleted permanently', { exact: true }).waitFor();
	await page.reload();
	await page.getByRole('heading', { name: 'Trash', exact: true }).waitFor();
	await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);
});

test('creates, edits, and deletes profile memory offline through reload', async ({
	page,
	context
}) => {
	await page.goto('/profile');
	await waitForServiceWorker(page);
	await page.getByRole('button', { name: 'Add memory', exact: true }).waitFor();
	await context.setOffline(true);
	const content = `Offline memory ${crypto.randomUUID()}`;
	await page.getByRole('button', { name: 'Add memory', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('New memory entry').fill(content);
	await dialog.getByRole('button', { name: 'Add memory', exact: true }).click();
	await dialog.waitFor({ state: 'hidden' });
	await page.reload();
	const row = page.getByRole('listitem').filter({ hasText: content });
	await row.getByRole('button', { name: 'Memory actions' }).click();
	await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
	await page.getByLabel('Edit memory entry').fill(`${content} edited`);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByLabel('Edit memory entry').waitFor({ state: 'hidden' });
	await page.reload();
	await page
		.getByRole('listitem')
		.filter({ hasText: `${content} edited` })
		.getByRole('button', { name: 'Memory actions' })
		.click();
	await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
	await page.reload();
	await page.getByRole('button', { name: 'Add memory', exact: true }).waitFor();
	await expect(page.getByRole('listitem').filter({ hasText: content })).toHaveCount(0);
});

test('retains skill description and instruction edits offline and synchronizes them on reconnect', async ({
	page,
	context
}) => {
	const href = '/skills/00000000-0000-4000-8000-000000000007';
	await page.goto(href);
	await waitForServiceWorker(page);
	await page.getByLabel('Skill description', { exact: true }).waitFor();
	await context.setOffline(true);
	const description = `Offline description ${crypto.randomUUID()}`;
	await page.getByLabel('Skill description', { exact: true }).fill(description);
	await page.getByLabel('Skill instructions', { exact: true }).fill('Retained instructions');
	await page.getByLabel('Skill instructions', { exact: true }).press('Control+s');
	await page.getByRole('button', { name: 'Saved on device · retry sync', exact: true }).waitFor();
	await page.reload();
	await page
		.getByLabel('Skill description', { exact: true })
		.filter({ hasText: description })
		.waitFor();
	await page
		.getByLabel('Skill instructions', { exact: true })
		.filter({ hasText: 'Retained instructions' })
		.waitFor();
	const acknowledgments: string[] = [];
	page.on('response', async (response) => {
		if (response.url().endsWith('/pushWorkspaceMutation') && response.ok())
			acknowledgments.push(await response.text());
	});
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect
		.poll(async () => ({
			description: await page.getByLabel('Skill description', { exact: true }).textContent(),
			applied: acknowledgments.filter((body) => body.includes('applied')).length
		}))
		.toEqual({ description, applied: 2 });
});

test('searches pending local text and retains an offline replacement through reload', async ({
	page,
	context
}) => {
	const href = '/notes/00000000-0000-4000-8000-000000000003';
	await page.goto(href);
	await waitForServiceWorker(page);
	const body = page.getByLabel('Note body', { exact: true });
	await body.waitFor();
	await context.setOffline(true);
	const phrase = `Searchable ${crypto.randomUUID()}`;
	await body.fill(phrase);
	await body.press('Control+s');
	await page.getByRole('button', { name: 'Saved on device · retry sync', exact: true }).waitFor();
	await page.keyboard.press('Control+Shift+f');
	await page.getByLabel('Search all notes', { exact: true }).fill(phrase);
	await page.getByLabel('Search all notes', { exact: true }).press('Enter');
	await page.getByLabel('Replace with', { exact: true }).fill('Replacement saved offline');
	await page.getByRole('button', { name: 'Replace all', exact: true }).click();
	await page
		.getByRole('alertdialog')
		.getByRole('button', { name: 'Replace all', exact: true })
		.click();
	await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
	await page.reload();
	await expect(page.getByLabel('Note body', { exact: true })).toContainText(
		'Replacement saved offline'
	);
});

test('creates export defaults offline and retains them through reload and acknowledgement', async ({
	page,
	context
}) => {
	await page.goto('/projects/00000000-0000-4000-8000-000000000002');
	await waitForServiceWorker(page);
	const openDefaults = async () => {
		await page.getByRole('button', { name: 'Project actions', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Export defaults…', exact: true }).click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Save defaults', exact: true })
			.waitFor();
	};
	await context.setOffline(true);
	await openDefaults();
	await page.getByLabel('Font family', { exact: true }).click();
	await page.getByRole('option', { name: 'Courier', exact: true }).click();
	await page.getByRole('button', { name: 'Save defaults', exact: true }).click();
	await page.getByRole('dialog').waitFor({ state: 'hidden' });
	await page.reload();
	await openDefaults();
	await page.getByLabel('Font family', { exact: true }).filter({ hasText: 'Courier' }).waitFor();
	const pushed = page.waitForResponse(
		(response) => response.url().endsWith('/pushWorkspaceMutation') && response.ok()
	);
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	expect(await (await pushed).text()).toContain('applied');
});

test('retains offline document preferences through reload and acknowledgement', async ({
	page,
	context
}) => {
	await page.goto('/settings?tab=documents');
	await waitForServiceWorker(page);
	const toggle = page.getByRole('switch', { name: 'Section numbering', exact: true });
	await toggle.waitFor();
	await context.setOffline(true);
	await toggle.click();
	const selected = await toggle.getAttribute('aria-checked');
	await page.getByRole('button', { name: 'Save document defaults', exact: true }).click();
	await page.getByText('Document defaults saved on this device', { exact: true }).waitFor();
	await page.reload();
	await toggle.waitFor();
	const retained = await toggle.getAttribute('aria-checked');
	const pushed = page.waitForResponse(
		(response) => response.url().endsWith('/pushWorkspaceMutation') && response.ok()
	);
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	expect({ retained, applied: (await (await pushed).text()).includes('applied') }).toEqual({
		retained: selected,
		applied: true
	});
});

test('keeps model and agent settings queued across offline tab navigation', async ({
	page,
	context
}) => {
	await page.goto('/settings?tab=models');
	await waitForServiceWorker(page);
	const suggestions = page.getByRole('switch', { name: 'Inline writing suggestions', exact: true });
	await suggestions.waitFor();
	await context.setOffline(true);
	await suggestions.click();
	const selected = await suggestions.getAttribute('aria-checked');
	await page.getByRole('button', { name: 'Save model defaults', exact: true }).click();
	await page.getByText('Model defaults saved on this device', { exact: true }).waitFor();
	await page.goto('/settings?tab=agents');
	await page.getByLabel('Web search engine', { exact: true }).click();
	await page.getByRole('option', { name: 'auto', exact: true }).click();
	await page.getByRole('button', { name: 'Save agent defaults', exact: true }).click();
	await page.getByText('Agent defaults saved on this device', { exact: true }).waitFor();
	await page.goto('/settings?tab=models');
	await suggestions.waitFor();
	const retained = await suggestions.getAttribute('aria-checked');
	const acknowledgments: string[] = [];
	page.on('response', async (response) => {
		if (response.url().endsWith('/pushWorkspaceMutation') && response.ok())
			acknowledgments.push(await response.text());
	});
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect
		.poll(() => ({
			retained,
			applied: acknowledgments.filter((body) => body.includes('applied')).length
		}))
		.toEqual({ retained: selected, applied: 2 });
});

test('keeps an open editor’s text visibly unsynchronized after another tab discards its queued write', async ({
	page,
	context
}) => {
	await page.goto('/notes/00000000-0000-4000-8000-000000000003');
	await waitForServiceWorker(page);
	const body = page.getByLabel('Note body', { exact: true });
	await body.waitFor();
	await context.setOffline(true);
	const text = 'Retain this buffer after another tab discards its queue entry';
	await body.fill(text);
	await body.press('Control+s');
	await page.getByRole('button', { name: 'Saved on device · retry sync', exact: true }).waitFor();
	const other = await context.newPage();
	await other.goto('/today');
	await other.getByRole('button', { name: 'Review changes', exact: true }).click();
	await other.getByRole('button', { name: 'Review', exact: true }).click();
	await other.getByRole('button', { name: 'Discard local change', exact: true }).click();
	await other.getByText('No changes are waiting to send.').waitFor();
	await page.bringToFront();
	await page.evaluate(() => window.dispatchEvent(new Event('focus')));
	await page.getByRole('button', { name: 'Couldn’t save · retry', exact: true }).waitFor();
	await expect(body).toContainText(text);
});

test('keeps tool and trust-policy changes in the shared offline outbox', async ({
	page,
	context
}) => {
	await page.goto('/settings?tab=tools');
	await waitForServiceWorker(page);
	await page.getByLabel('Find a tool', { exact: true }).fill('archive_project');
	const tool = page.getByRole('switch', { name: 'archive project', exact: true });
	await tool.waitFor();
	await context.setOffline(true);
	await tool.click();
	await page.getByText('Saved on device', { exact: true }).waitFor();
	const selected = await tool.getAttribute('aria-checked');
	await page.goto('/settings?tab=policies');
	const policy = page.getByRole('group', { name: 'Trust policy for Agent', exact: true });
	await policy.getByRole('radio', { name: 'Auto-accept', exact: true }).click();
	await page.getByText('Saved on device', { exact: true }).waitFor();
	await page.goto('/settings?tab=tools');
	await page.getByLabel('Find a tool', { exact: true }).fill('archive_project');
	const retained = await tool.getAttribute('aria-checked');
	const acknowledgments: string[] = [];
	page.on('response', async (response) => {
		if (response.url().endsWith('/pushWorkspaceMutation') && response.ok())
			acknowledgments.push(await response.text());
	});
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect
		.poll(() => ({
			retained,
			applied: acknowledgments.filter((body) => body.includes('applied')).length
		}))
		.toEqual({ retained: selected, applied: 2 });
});

test('retains a renamed chat through offline reload and acknowledgement', async ({
	page,
	context
}) => {
	await page.goto('/chats');
	await waitForServiceWorker(page);
	await page
		.getByRole('button', { name: 'Actions for Saved synchronization chat', exact: true })
		.click();
	await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
	await context.setOffline(true);
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('textbox').fill('Offline chat name');
	await dialog.getByRole('button', { name: 'Save', exact: true }).click();
	await page.getByText('Chat name saved on this device.', { exact: true }).waitFor();
	await page.reload();
	await page.getByRole('button', { name: 'Actions for Offline chat name', exact: true }).waitFor();
	const pushed = page.waitForResponse(
		(response) => response.url().endsWith('/pushWorkspaceMutation') && response.ok()
	);
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	expect(await (await pushed).text()).toContain('applied');
});

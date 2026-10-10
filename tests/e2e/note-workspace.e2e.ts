import { randomBytes, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import postgres from 'postgres';
import { expect, test as base, type Page } from '@playwright/test';

const test = base.extend<{ editorNotes: { first: string; second: string } }>({
	editorNotes: async ({ context }, use) => {
		config({ quiet: true });
		const databaseUrl = process.env.DATABASE_URL;
		if (
			!databaseUrl ||
			!['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)
		)
			throw new Error('Editor scenarios require a local development/test database');
		const sql = postgres(databaseUrl, { max: 1 });
		const user = randomUUID();
		const project = randomUUID();
		const first = randomUUID();
		const second = randomUUID();
		const token = randomBytes(32).toString('hex');
		try {
			await sql`insert into users (id, email, display_name, role) values (${user}, ${`${user}@local.invalid`}, 'Editor scenario', 'USER')`;
			await sql`insert into sessions (id, user_id, expires_at) values (${token}, ${user}, now() + interval '1 day')`;
			await sql`insert into projects (id, user_id, name, role) values (${project}, ${user}, 'Editor scenario', 'inbox')`;
			for (const [id, title, text] of [
				[first, 'First note', 'Original passage'],
				[second, 'Second note', 'Sibling passage']
			]) {
				const document = {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
				};
				await sql`insert into notes (id, user_id, project_id, kind, title, document, plain_text) values (${id}, ${user}, ${project}, 'note', ${title}, ${sql.json(document)}, ${text})`;
			}
			await sql`insert into agent_preferences (user_id, inline_suggestions_enabled) values (${user}, false)`;
			await context.clearCookies();
			await context.addCookies([
				{
					name: 'session',
					value: token,
					domain: '127.0.0.1',
					path: '/',
					httpOnly: true,
					sameSite: 'Lax'
				}
			]);
			await use({ first, second });
		} finally {
			await sql`delete from users where id = ${user} and email = ${`${user}@local.invalid`}`;
			await sql.end();
		}
	}
});

const body = (page: Page) => page.getByRole('textbox', { name: 'Note body', exact: true });
const publish = (page: Page) =>
	page.getByRole('button', { name: 'Publish note (Ctrl+S, S)', exact: true });

async function savedText(noteId: string, text: string): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('Missing local database');
	const sql = postgres(databaseUrl, { max: 1 });
	try {
		await expect
			.poll(
				async () => (await sql`select plain_text from notes where id = ${noteId}`)[0]?.plain_text
			)
			.toBe(text);
	} finally {
		await sql.end();
	}
}

async function publishedText(noteId: string, text: string): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('Missing local database');
	const sql = postgres(databaseUrl, { max: 1 });
	try {
		await expect
			.poll(
				async () =>
					(
						await sql`select plain_text from notes where id = ${noteId} and published_revision = current_revision`
					)[0]?.plain_text
			)
			.toBe(text);
	} finally {
		await sql.end();
	}
}

async function openActions(page: Page, action: string): Promise<void> {
	await page.getByRole('button', { name: 'Note actions', exact: true }).click();
	await page.getByRole('menuitem', { name: action, exact: true }).click();
}

test('publication, draft discard and history restore preserve the saved note and sibling tab', async ({
	page,
	editorNotes
}) => {
	await page.goto(`/notes/${editorNotes.first}?tabs=${editorNotes.first},${editorNotes.second}`);
	await expect(body(page)).toHaveText('Original passage');
	await publish(page).click();
	await publishedText(editorNotes.first, 'Original passage');
	await body(page).fill('Published second passage');
	await savedText(editorNotes.first, 'Published second passage');
	await publish(page).click();
	await publishedText(editorNotes.first, 'Published second passage');
	await body(page).fill('Unpublished draft');
	await page.keyboard.press('ControlOrMeta+s');
	await savedText(editorNotes.first, 'Unpublished draft');
	page.once('dialog', (dialog) => dialog.accept());
	await openActions(page, 'Discard changes');
	await expect(body(page)).toHaveText('Published second passage');
	await savedText(editorNotes.first, 'Published second passage');
	await openActions(page, 'Version history');
	await page.getByRole('list', { name: 'Versions' }).getByRole('button').last().click();
	await page.getByRole('button', { name: 'Restore previous version', exact: true }).click();
	await page.getByRole('button', { name: 'Restore', exact: true }).click();
	await expect(body(page)).toHaveText('Original passage');
	await savedText(editorNotes.first, 'Original passage');
	await page.getByRole('tab', { name: 'Second note', exact: true }).click();
	await expect(body(page)).toHaveText('Sibling passage');
	await page.getByRole('tab', { name: 'First note', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/notes/${editorNotes.first}`));
	await page.reload();
	await expect(body(page)).toHaveText('Original passage');
});

test('offline save and publication preserve undo across reconnect', async ({
	page,
	context,
	editorNotes
}) => {
	await page.goto(`/notes/${editorNotes.first}`);
	await expect(body(page)).toHaveText('Original passage');
	await context.setOffline(true);
	await body(page).fill('Offline passage');
	await body(page).locator('p').click({ clickCount: 3 });
	await page.keyboard.press('ControlOrMeta+s');
	await expect
		.poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
		.toBe('Offline passage');
	await publish(page).click();
	await expect(publish(page)).toBeDisabled();
	await body(page).focus();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(body(page)).toHaveText('Original passage');
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(body(page)).toHaveText('Offline passage');
	await context.setOffline(false);
	await savedText(editorNotes.first, 'Offline passage');
	await page.reload();
	await expect(body(page)).toHaveText('Offline passage');
});

for (const choice of ['Keep mine', 'Use latest']) {
	test(`conflicting offline edits can resolve with ${choice}`, async ({
		page,
		context,
		browser,
		editorNotes
	}) => {
		await page.goto(`/notes/${editorNotes.first}`);
		await expect(body(page)).toHaveText('Original passage');
		const other = await browser.newContext({ storageState: await context.storageState() });
		try {
			const remote = await other.newPage();
			await remote.goto(new URL(`/notes/${editorNotes.first}`, page.url()).href);
			await expect(body(remote)).toHaveText('Original passage');
			await context.setOffline(true);
			await body(page).fill('Local conflicting passage');
			await page.keyboard.press('ControlOrMeta+s');
			await body(remote).fill('Remote conflicting passage');
			await remote.keyboard.press('ControlOrMeta+s');
			await savedText(editorNotes.first, 'Remote conflicting passage');
			await context.setOffline(false);
			await page.getByRole('button', { name: 'Review conflict', exact: true }).click();
			await page.getByRole('button', { name: choice, exact: true }).click();
			const expected =
				choice === 'Keep mine' ? 'Local conflicting passage' : 'Remote conflicting passage';
			await expect(body(page)).toHaveText(expected);
			await savedText(editorNotes.first, expected);
			await page.reload();
			await expect(body(page)).toHaveText(expected);
		} finally {
			await other.close();
		}
	});
}

import { randomBytes, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import postgres from 'postgres';
import { expect, test as base } from '@playwright/test';

const test = base.extend<{ editorNotes: { first: string; second: string; media: string } }>({
	editorNotes: async ({ context, page }, use) => {
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
		const media = randomUUID();
		const image = await page.evaluate(() => {
			const canvas = document.createElement('canvas');
			canvas.width = 32;
			canvas.height = 32;
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Canvas is required');
			context.fillStyle = 'green';
			context.fillRect(0, 0, 32, 32);
			return canvas.toDataURL();
		});
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
			const mediaDocument = {
				type: 'doc',
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: 'Clipboard media' }] },
					{ type: 'image', attrs: { src: image, alt: 'Green square' } },
					{ type: 'mermaid', content: [{ type: 'text', text: 'graph TD; A[Start]-->B[Finish]' }] }
				]
			};
			await sql`insert into notes (id, user_id, project_id, kind, title, document, plain_text) values (${media}, ${user}, ${project}, 'note', 'Media note', ${sql.json(mediaDocument)}, 'Clipboard media')`;
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
			await use({ first, second, media });
		} finally {
			await sql`delete from users where id = ${user} and email = ${`${user}@local.invalid`}`;
			await sql.end();
		}
	}
});

test('menu paste preserves selection, undo and autosave across sibling tabs', async ({
	page,
	context,
	editorNotes
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.setViewportSize({ width: 1680, height: 1000 });
	await page.goto(`/notes/${editorNotes.first}?tabs=${editorNotes.first},${editorNotes.second}`);
	const body = page.getByRole('textbox', { name: 'Note body', exact: true });
	await expect(body).toHaveText('Original passage');
	const paragraph = body.locator('p').first();
	await paragraph.click({ clickCount: 3 });
	await paragraph.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Copy as markdown' }).click();
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toBe('Original passage');
	await paragraph.click({ clickCount: 3 });
	await page.evaluate(() => navigator.clipboard.writeText('Replacement passage'));
	await paragraph.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Paste raw', exact: true }).click();
	await expect(body).toHaveText('Replacement passage');
	await page.keyboard.press('ControlOrMeta+z');
	await expect(body).toHaveText('Original passage');
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(body).toHaveText('Replacement passage');
	// Read the committed write through the server before reloading; do not rely on a delay.
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('Missing local database');
	const sql = postgres(databaseUrl, { max: 1 });
	try {
		await expect
			.poll(
				async () =>
					(await sql`select plain_text from notes where id = ${editorNotes.first}`)[0]?.plain_text
			)
			.toBe('Replacement passage');
	} finally {
		await sql.end();
	}
	await page.getByRole('tab', { name: 'Second note', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Note body', exact: true })).toHaveText(
		'Sibling passage'
	);
	await page.getByRole('tab', { name: 'First note', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Note body', exact: true })).toHaveText(
		'Replacement passage'
	);
	await expect(page).toHaveURL(new RegExp(`/notes/${editorNotes.first}`));
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Note body', exact: true })).toHaveText(
		'Replacement passage'
	);
	await page.getByRole('button', { name: 'Ask about this note', exact: true }).click();
	await expect(page.locator('#chat-composer')).toHaveValue(/\S/);
	await expect(page.getByRole('button', { name: 'Stop generation', exact: true })).toHaveCount(0);
});

test('native media copy embeds portable images and cut remains undoable', async ({
	page,
	context,
	editorNotes
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto(`/notes/${editorNotes.media}`);
	const body = page.getByRole('textbox', { name: 'Note body', exact: true });
	await expect(body).toContainText('Clipboard media');
	await body.locator('p').first().click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('ControlOrMeta+c');
	await expect
		.poll(async () =>
			page.evaluate(async () => {
				const items = await navigator.clipboard.read();
				const item = items.find((value) => value.types.includes('text/html'));
				if (!item) return 0;
				const html = await (await item.getType('text/html')).text();
				const document = new DOMParser().parseFromString(html, 'text/html');
				return document.querySelectorAll('img[src^="data:image/png"]').length;
			})
		)
		.toBe(2);
	await body.focus();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('ControlOrMeta+x');
	await expect(body.locator('img')).toHaveCount(0);
	await expect(body).not.toContainText('Clipboard media');
	await page.keyboard.press('ControlOrMeta+z');
	await expect(body).toContainText('Clipboard media');
	await expect(body.locator('img[alt="Green square"]')).toHaveCount(1);
});

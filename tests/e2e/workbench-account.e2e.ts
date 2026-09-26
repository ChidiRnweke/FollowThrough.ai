import { expect, test } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import postgres from 'postgres';

test('restores each account’s saved tabs after switching accounts on the same device', async ({
	page,
	context
}) => {
	const databaseUrl = process.env.DATABASE_URL;
	const firstAccount = process.env.LOCAL_USER_ID;
	if (!databaseUrl || !firstAccount)
		throw new Error('The isolated PWA database and account are required');
	const sql = postgres(databaseUrl, { max: 1 });
	const secondAccount = randomUUID();
	const secondToken = randomBytes(32).toString('hex');
	const firstProject = randomUUID();
	const secondProject = randomUUID();
	const firstNote = randomUUID();
	const siblingNote = randomUUID();
	const secondNote = randomUUID();
	const firstToken = (await context.cookies()).find((cookie) => cookie.name === 'session')?.value;
	if (!firstToken) throw new Error('The first account session is required');
	const changeAccount = async (account: string, token: string) => {
		// End the old page before changing its account binding. Its account guard
		// otherwise reloads concurrently with the next explicit test navigation.
		// The browser context retains both accounts' storage across this navigation.
		await page.goto('about:blank');
		await context.addCookies([
			{
				name: 'session',
				value: token,
				domain: '127.0.0.1',
				path: '/',
				httpOnly: true,
				sameSite: 'Lax'
			},
			{ name: 'workspace_account', value: account, domain: '127.0.0.1', path: '/', sameSite: 'Lax' }
		]);
	};
	try {
		await sql`insert into users (id,email,display_name,role) values (${secondAccount},${`${secondAccount}@local.invalid`},'Second account','USER')`;
		await sql`insert into sessions (id,user_id,expires_at) values (${secondToken},${secondAccount},now()+interval '1 day')`;
		await sql`insert into projects (id,user_id,name,role) values (${firstProject},${firstAccount},'Account A work','workspace'),(${secondProject},${secondAccount},'Inbox','inbox')`;
		for (const note of [
			{
				id: firstNote,
				account: firstAccount,
				project: firstProject,
				title: 'Account A first note'
			},
			{
				id: siblingNote,
				account: firstAccount,
				project: firstProject,
				title: 'Account A second note'
			},
			{ id: secondNote, account: secondAccount, project: secondProject, title: 'Account B note' }
		])
			await sql`insert into notes (id,user_id,project_id,kind,title,document,plain_text) values (${note.id},${note.account},${note.project},'note',${note.title},'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Account-specific working set"}]}]}'::jsonb,'Account-specific working set')`;
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
		await page.goto(`/notes/${firstNote}?tabs=${firstNote},${siblingNote}`);
		await page.locator(`[data-project-tab="${siblingNote}"]`).waitFor();
		await page.getByRole('textbox', { name: 'Note body', exact: true }).waitFor();
		await changeAccount(secondAccount, secondToken);
		await page.goto(`/notes/${secondNote}`);
		await page.locator(`[data-project-tab="${secondNote}"]`).waitFor();
		await page.getByRole('textbox', { name: 'Note body', exact: true }).waitFor();
		await changeAccount(firstAccount, firstToken);
		await page.goto(`/notes/${firstNote}`);
		await page.locator(`[data-project-tab="${firstNote}"]`).waitFor();
		await page.getByRole('textbox', { name: 'Note body', exact: true }).waitFor();
		if (process.env.WORKBENCH_EVIDENCE_PATH) {
			await mkdir('docs/pr-evidence/account-owned-workbench-tabs', { recursive: true });
			await page.evaluate(async () => {
				document.documentElement.classList.remove('dark');
				await document.fonts.ready;
			});
			await page.screenshot({ path: process.env.WORKBENCH_EVIDENCE_PATH });
		}
		await expect
			.poll(() =>
				page
					.locator('[data-project-tab]')
					.evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-project-tab')))
			)
			.toEqual([firstNote, siblingNote]);
	} finally {
		await sql`delete from projects where id=${firstProject}`;
		await sql`delete from users where id=${secondAccount}`;
		await sql.end();
	}
});

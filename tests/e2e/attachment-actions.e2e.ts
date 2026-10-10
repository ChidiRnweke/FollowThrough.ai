import { randomBytes, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import postgres from 'postgres';
import { expect, test as base } from '@playwright/test';

const test = base.extend<{ attachmentScenario: { projectId: string; noteId: string } }>({
	attachmentScenario: async ({ context }, use) => {
		config({ quiet: true });
		const url = process.env.DATABASE_URL;
		if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
			throw new Error('Attachment scenarios require a local development/test database');
		const sql = postgres(url, { max: 1 });
		const user = randomUUID(),
			projectId = randomUUID(),
			noteId = randomUUID(),
			attachment = randomUUID(),
			version = randomUUID(),
			token = randomBytes(32).toString('hex');
		try {
			await sql`insert into users (id,email,display_name,role) values (${user},${`${user}@local.invalid`},'Attachment actions','USER')`;
			await sql`insert into sessions (id,user_id,expires_at) values (${token},${user},now()+interval '1 day')`;
			await sql`insert into projects (id,user_id,name,role) values (${projectId},${user},'Attachment actions','inbox')`;
			await sql`insert into agent_preferences (user_id,inline_suggestions_enabled) values (${user},false)`;
			await sql`insert into attachments (id,user_id,project_id,path) values (${attachment},${user},${projectId},'scenario-brief.txt')`;
			await sql`insert into attachment_versions (id,attachment_id,object_key,media_type,byte_size,checksum_sha256,processing_status,processing_failure) values (${version},${attachment},${`attachment-actions/${version}/brief.txt`},'text/plain',128,${'a'.repeat(64)},'failed','Seeded processing failure')`;
			await sql`update attachments set current_version_id=${version} where id=${attachment}`;
			const document = {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep this passage.' }] }]
			};
			await sql`insert into notes (id,user_id,project_id,kind,title,document,plain_text) values (${noteId},${user},${projectId},'note','Attachment note',${sql.json(document)},'Keep this passage.')`;
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
			await use({ projectId, noteId });
		} finally {
			await sql`delete from users where id=${user} and email=${`${user}@local.invalid`}`;
			await sql`delete from attachment_object_removals where object_key=${`attachment-actions/${version}/brief.txt`}`;
			await sql.end();
		}
	}
});

test('a failed attachment can be retried and its queued metadata survives reload', async ({
	page,
	attachmentScenario
}) => {
	await page.goto(`/projects/${attachmentScenario.projectId}/attachments`);
	await page.getByText('scenario-brief.txt', { exact: true }).waitFor();
	await page.getByRole('button', { name: 'Actions for scenario-brief.txt' }).click();
	await page.getByRole('menuitem', { name: 'Retry', exact: true }).click();
	await page.getByText('queued', { exact: true }).waitFor();
	await page.reload();
	await page.getByText('queued', { exact: true }).waitFor();
	expect(await page.getByText('scenario-brief.txt', { exact: true }).count()).toBe(1);
});

test('removing a seeded attachment updates the list and stays removed after reload', async ({
	page,
	attachmentScenario
}) => {
	await page.goto(`/projects/${attachmentScenario.projectId}/attachments`);
	await page.getByText('scenario-brief.txt', { exact: true }).waitFor();
	await page.getByRole('button', { name: 'Actions for scenario-brief.txt' }).click();
	await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click();
	await page.getByText('No attachments yet.', { exact: true }).waitFor();
	await page.reload();
	await page.getByText('No attachments yet.', { exact: true }).waitFor();
	expect(await page.getByText('scenario-brief.txt', { exact: true }).count()).toBe(0);
});

test('reservation failure leaves upload usable and does not create an attachment', async ({
	page,
	attachmentScenario
}) => {
	await page.route('**/_app/remote/**/initiateAttachmentUpload', (route) =>
		route.abort('connectionfailed')
	);
	await page.goto(`/projects/${attachmentScenario.projectId}/attachments`);
	await page.getByText('scenario-brief.txt', { exact: true }).waitFor();
	await page.locator('input[type=file]').setInputFiles({
		name: 'rejected.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('Rejected')
	});
	await page.getByText('Failed to fetch', { exact: true }).waitFor();
	expect({
		enabled: await page.locator('input[type=file]').isEnabled(),
		unexpected: await page.getByText('rejected.txt', { exact: true }).count()
	}).toEqual({ enabled: true, unexpected: 0 });
});

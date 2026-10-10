import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import AdmZip from 'adm-zip';
import { S3Client, DeleteObjectCommand, paginateListObjectsV2 } from '@aws-sdk/client-s3';
import { config } from 'dotenv';
import postgres from 'postgres';
import { expect, test as base } from '@playwright/test';
declare global {
	interface Window {
		exportEvidence: { created: string[]; released: string[] };
	}
}
const test = base.extend<{ exportScenario: { projectId: string; noteId: string } }>({
	exportScenario: async ({ context }, use) => {
		config({ quiet: true });
		const url = process.env.DATABASE_URL;
		if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
			throw new Error('Export scenarios require a local development/test database');
		const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
		if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint).hostname))
			throw new Error('Export scenarios require local object storage');
		const storage = new S3Client({
			endpoint,
			region: process.env.S3_REGION ?? 'us-east-1',
			forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
			credentials: {
				accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'followthrough',
				secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'followthrough-local-secret'
			}
		});
		const bucket = process.env.S3_BUCKET ?? 'followthrough-attachments';
		const sql = postgres(url, { max: 1 });
		const user = randomUUID(),
			projectId = randomUUID(),
			noteId = randomUUID(),
			artifact = randomUUID(),
			token = randomBytes(32).toString('hex');
		try {
			await sql`insert into users (id,email,display_name,role) values (${user},${user + '@local.invalid'},'Export actions','USER')`;
			await sql`insert into sessions (id,user_id,expires_at) values (${token},${user},now()+interval '1 day')`;
			await sql`insert into projects (id,user_id,name,role) values (${projectId},${user},'Export actions','inbox')`;
			await sql`insert into agent_preferences (user_id,inline_suggestions_enabled) values (${user},false)`;
			await sql`insert into notes (id,user_id,project_id,kind,title,document,plain_text) values (${noteId},${user},${projectId},'note','Quarterly review',${sql.json({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A seeded report for export verification.' }] }] })},'A seeded report for export verification.')`;
			await sql`insert into artifacts (id,user_id,project_id,title,format,object_key,byte_size,source_note_ids) values (${artifact},${user},${projectId},'Seeded report','pdf',${`export-actions/${artifact}.pdf`},128,${sql.json([noteId])})`;
			await sql`insert into notes (id,user_id,project_id,kind,title,document,plain_text,position) values (${randomUUID()},${user},${projectId},'note','Appendix',${sql.json({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Appendix evidence passage.' }] }] })},'Appendix evidence passage.',1)`;
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
			try {
				for (const prefix of [`artifacts/${user}/`, `bundles/${user}/`]) {
					for await (const page of paginateListObjectsV2(
						{ client: storage },
						{ Bucket: bucket, Prefix: prefix }
					))
						for (const object of page.Contents ?? [])
							if (object.Key)
								await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
				}
			} finally {
				await sql`delete from users where id=${user} and email=${user + '@local.invalid'}`;
				await sql.end();
				storage.destroy();
			}
		}
	}
});
test('saves export defaults offline and retains them after reconnect and reload', async ({
	page,
	context,
	exportScenario
}) => {
	await page.goto(`/projects/${exportScenario.projectId}`);
	const openDefaults = async () => {
		await page.getByRole('button', { name: 'Project actions', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Export defaults…', exact: true }).click();
		await page.getByRole('button', { name: 'Save defaults', exact: true }).waitFor();
	};
	await openDefaults();
	await context.setOffline(true);
	await page.getByLabel('Font family', { exact: true }).click();
	await page.getByRole('option', { name: 'Courier', exact: true }).click();
	await page.getByRole('button', { name: 'Save defaults', exact: true }).click();
	await page.getByRole('dialog').waitFor({ state: 'hidden' });
	await openDefaults();
	await page.getByLabel('Font family', { exact: true }).filter({ hasText: 'Courier' }).waitFor();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await page.reload();
	await openDefaults();
	expect(await page.getByLabel('Font family', { exact: true }).textContent()).toContain('Courier');
});
test('retries a failed preview and releases the replacement PDF URL on dismissal', async ({
	page,
	exportScenario
}) => {
	await page.addInitScript(() => {
		window.exportEvidence = { created: [], released: [] };
		const create = URL.createObjectURL.bind(URL),
			release = URL.revokeObjectURL.bind(URL);
		URL.createObjectURL = (blob) => {
			const url = create(blob);
			if (blob instanceof Blob && blob.type === 'application/pdf')
				window.exportEvidence.created.push(url);
			return url;
		};
		URL.revokeObjectURL = (url) => {
			window.exportEvidence.released.push(url);
			release(url);
		};
	});
	await page.route('**/_app/remote/**/previewDocument', (route) => route.abort('connectionfailed'));
	await page.goto(`/notes/${exportScenario.noteId}`);
	await page.getByRole('button', { name: 'Export document', exact: true }).click();
	await page.getByRole('button', { name: 'Preview PDF', exact: true }).click();
	await page.getByText('Failed to fetch', { exact: true }).waitFor();
	await page.unroute('**/_app/remote/**/previewDocument');
	await page.getByRole('button', { name: 'Preview PDF', exact: true }).click();
	const preview = page.getByRole('dialog').filter({ has: page.locator('iframe') });
	await preview.waitFor();
	const source = await preview.locator('iframe').getAttribute('src');
	if (!source) throw new Error('The PDF preview has no URL');
	const signature = await page.evaluate(
		async (url) => new TextDecoder().decode((await (await fetch(url)).arrayBuffer()).slice(0, 5)),
		source
	);
	await page.keyboard.press('Escape');
	await preview.waitFor({ state: 'hidden' });
	expect({
		signature,
		...(await page.evaluate(() => ({
			created: window.exportEvidence.created.length,
			released: window.exportEvidence.created.filter((url) =>
				window.exportEvidence.released.includes(url)
			).length
		})))
	}).toEqual({ signature: '%PDF-', created: 1, released: 1 });
});
test('reports artifact regeneration failure and leaves its actions usable', async ({
	page,
	exportScenario
}) => {
	await page.route('**/_app/remote/**/regenerateArtifact', (route) =>
		route.abort('connectionfailed')
	);
	await page.goto(`/artifacts?projectId=${exportScenario.projectId}`);
	await page.getByRole('main').getByText('Seeded report', { exact: true }).waitFor();
	await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
	await page
		.getByText('Could not regenerate the document. Failed to fetch', { exact: true })
		.waitFor();
	expect({
		regenerate: await page.getByRole('button', { name: 'Regenerate', exact: true }).isEnabled(),
		download: await page.getByRole('button', { name: 'Download', exact: true }).isEnabled()
	}).toEqual({ regenerate: true, download: true });
});
test('removes a seeded artifact and retains its removal after reload', async ({
	page,
	exportScenario
}) => {
	await page.goto(`/artifacts?projectId=${exportScenario.projectId}`);
	await page.getByRole('main').getByText('Seeded report', { exact: true }).waitFor();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByText('No artifacts yet.', { exact: true }).waitFor();
	await page.reload();
	await page.getByText('No artifacts yet.', { exact: true }).waitFor();
	expect(await page.getByRole('main').getByText('Seeded report', { exact: true }).count()).toBe(0);
});
for (const format of ['pdf', 'docx'] as const) {
	test(`generates, downloads and regenerates a real ${format.toUpperCase()} artifact`, async ({
		page,
		exportScenario
	}) => {
		await page.goto(`/notes/${exportScenario.noteId}`);
		await page.getByRole('button', { name: 'Export document', exact: true }).click();
		await page.getByRole('button', { name: format.toUpperCase(), exact: true }).click();
		await page.getByRole('button', { name: 'Generate', exact: true }).click();
		const link = page.getByRole('dialog').getByRole('link', { name: 'Download', exact: true });
		await link.waitFor();
		const url = await link.getAttribute('href');
		if (!url) throw new Error('No generated document URL');
		const response = await page.request.get(url);
		const content = await response.body();
		await page.goto(`/artifacts?projectId=${exportScenario.projectId}`);
		const artifact = page.getByRole('main').locator('li').filter({ hasText: 'Quarterly review' });
		await artifact.waitFor();
		const download = page.waitForEvent('download');
		await artifact.getByRole('button', { name: 'Download', exact: true }).click();
		const downloadedPath = await (await download).path();
		if (!downloadedPath) throw new Error('Artifact download has no local file');
		const downloaded = await readFile(downloadedPath);
		const regenerated = page.waitForEvent('download');
		await artifact.getByRole('button', { name: 'Regenerate', exact: true }).click();
		const regeneratedPath = await (await regenerated).path();
		if (!regeneratedPath) throw new Error('Regenerated artifact download has no local file');
		const refreshed = await readFile(regeneratedPath);
		await page.getByText('Document regenerated', { exact: true }).waitFor();
		const body = (bytes: Buffer) =>
			format === 'pdf'
				? bytes.subarray(0, 5).toString()
				: new AdmZip(bytes)
						.readAsText('word/document.xml')
						.includes('A seeded report for export verification.');
		expect({
			status: response.status(),
			generated: body(content),
			downloaded: body(downloaded),
			regenerated: body(refreshed)
		}).toEqual({
			status: 200,
			generated: format === 'pdf' ? '%PDF-' : true,
			downloaded: format === 'pdf' ? '%PDF-' : true,
			regenerated: format === 'pdf' ? '%PDF-' : true
		});
	});
}
for (const bundle of ['zip', 'merged'] as const) {
	test(`generates a real ${bundle} bundle from both project notes`, async ({
		page,
		exportScenario
	}) => {
		await page.goto(`/projects/${exportScenario.projectId}`);
		await page.getByRole('button', { name: 'Project actions', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Export documents…', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('button', { name: 'DOCX', exact: true }).click();
		if (bundle === 'merged')
			await dialog.getByRole('button', { name: 'One document', exact: true }).click();
		await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
		const link = dialog.getByRole('link', { name: 'Download', exact: true });
		await link.waitFor();
		const url = await link.getAttribute('href');
		if (!url) throw new Error('The bundle has no URL');
		const response = await page.request.get(url);
		const archive = new AdmZip(await response.body());
		const documents =
			bundle === 'zip'
				? archive
						.getEntries()
						.filter((entry) => !entry.isDirectory)
						.map((entry) => new AdmZip(entry.getData()).readAsText('word/document.xml'))
				: [archive.readAsText('word/document.xml')];
		expect({
			status: response.status(),
			files: documents.length,
			report: documents.some((xml) => xml.includes('A seeded report for export verification.')),
			appendix: documents.some((xml) => xml.includes('Appendix evidence passage.'))
		}).toEqual({ status: 200, files: bundle === 'zip' ? 2 : 1, report: true, appendix: true });
	});
}

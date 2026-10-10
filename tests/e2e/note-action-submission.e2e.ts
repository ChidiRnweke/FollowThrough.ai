import { randomBytes, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import postgres from 'postgres';
import { expect, test as base } from '@playwright/test';

const test = base.extend<{ actionNote: { noteId: string; accountId: string } }>({
	actionNote: async ({ context }, use) => {
		config({ quiet: true });
		const databaseUrl = process.env.DATABASE_URL;
		if (
			!databaseUrl ||
			!['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)
		)
			throw new Error('Note action scenarios require a local development/test database');
		const sql = postgres(databaseUrl, { max: 1 });
		const accountId = randomUUID();
		const projectId = randomUUID();
		const noteId = randomUUID();
		const token = randomBytes(32).toString('hex');
		try {
			await sql`insert into users (id, email, display_name, role) values (${accountId}, ${`${accountId}@local.invalid`}, 'Action evidence', 'USER')`;
			await sql`insert into sessions (id, user_id, expires_at) values (${token}, ${accountId}, now() + interval '1 day')`;
			await sql`insert into projects (id, user_id, name, role) values (${projectId}, ${accountId}, 'Action evidence', 'inbox')`;
			const text = 'We will review the proposal, then approve the release.';
			const document = {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
			};
			await sql`insert into notes (id, user_id, project_id, kind, title, document, plain_text) values (${noteId}, ${accountId}, ${projectId}, 'note', 'Release workflow', ${sql.json(document)}, ${text})`;
			await sql`insert into agent_preferences (user_id, inline_suggestions_enabled) values (${accountId}, false)`;
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
			await use({ noteId, accountId });
		} finally {
			await sql`delete from users where id = ${accountId} and email = ${`${accountId}@local.invalid`}`;
			await sql.end();
		}
	}
});

for (const action of [
	{ label: 'Extract promises', key: 'promise', remote: 'extractPromises' },
	{ label: 'Diagram', key: 'diagram', remote: 'generateDiagram' }
]) {
	test(`${action.label} retains and reuses the persisted request after transport failure and reload`, async ({
		page,
		actionNote
	}) => {
		const key = `followthrough.notes.${action.key}-submissions.${actionNote.accountId}`;
		const persistedBeforeSend: (string | null)[] = [];
		await page.route(`**/_app/remote/**/${action.remote}`, async (route) => {
			persistedBeforeSend.push(
				await page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key)
			);
			await route.abort('connectionfailed');
		});
		await page.goto(`/notes/${actionNote.noteId}`);
		const body = page.getByRole('textbox', { name: 'Note body', exact: true });
		await body.waitFor();
		await body.click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.getByRole('button', { name: action.label, exact: true }).click();
		await page.getByText('Failed to fetch', { exact: true }).waitFor();
		const retained = await page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key);
		await page.reload();
		await body.waitFor();
		await body.click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.getByRole('button', { name: action.label, exact: true }).click();
		await page.getByText('Failed to fetch', { exact: true }).waitFor();
		const afterRetry = await page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key);
		expect({ persisted: retained !== null, attempts: persistedBeforeSend, afterRetry }).toEqual({
			persisted: true,
			attempts: [retained, retained],
			afterRetry: retained
		});
	});
}

test('failed immediate draw.io acceptance keeps the conversion available for dismissal', async ({
	page,
	actionNote
}) => {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('Missing local database');
	const sql = postgres(databaseUrl, { max: 1 });
	const suggestionId = randomUUID();
	const provenanceId = randomUUID();
	try {
		const document = {
			type: 'doc',
			content: [
				{
					type: 'mermaid',
					attrs: { pendingDrawioSuggestionId: suggestionId },
					content: [{ type: 'text', text: 'graph LR; A[Review]-->B[Approve]' }]
				}
			]
		};
		const source =
			'<mxfile><diagram id="release" name="Release"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Review proposal" vertex="1" parent="1"><mxGeometry x="80" y="80" width="160" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';
		await sql`update notes set document = ${sql.json(document)}, plain_text = 'Review to approve' where id = ${actionNote.noteId}`;
		await sql`insert into provenance (id, user_id, producer_kind, producer_name, pipeline, metadata) values (${provenanceId}, ${actionNote.accountId}, 'agent', 'Diagram Agent', 'agent', ${sql.json({ operation: 'convert' })})`;
		await sql`insert into suggestions (id, user_id, note_id, kind, status, payload, provenance_id) values (${suggestionId}, ${actionNote.accountId}, ${actionNote.noteId}, 'diagram', 'proposed', ${sql.json({ noteId: actionNote.noteId, kind: 'drawio', title: 'Release workflow', source })}, ${provenanceId})`;
		await page.route('**/_app/remote/**/acceptSuggestion', (route) =>
			route.abort('connectionfailed')
		);
		await page.goto(`/notes/${actionNote.noteId}`);
		await page.getByRole('button', { name: 'Review', exact: true }).click();
		await page.frameLocator('iframe').locator('.geDiagramContainer').waitFor();
		await page.getByRole('button', { name: 'Accept diagram', exact: true }).click();
		await page.getByText('Failed to fetch', { exact: true }).waitFor();
		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await page.getByRole('button', { name: 'Dismiss conversion', exact: true }).click();
		await page.getByText('draw.io conversion dismissed', { exact: true }).waitFor();
		const rows = await sql`select status from suggestions where id = ${suggestionId}`;
		expect(rows.map((row) => row.status)).toEqual(['rejected']);
	} finally {
		await sql.end();
	}
});

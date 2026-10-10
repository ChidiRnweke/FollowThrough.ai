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

test('hydration replays a completed diagram revision into the mounted note and saves it', async ({
	page,
	actionNote
}) => {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('Missing local database');
	const sql = postgres(databaseUrl, { max: 1 });
	const runId = randomUUID();
	const conversationId = randomUUID();
	const provenanceId = randomUUID();
	const source = 'graph LR; A[Review]-->B[Approve]';
	const revised = 'graph LR; A[Review]-->B[Approved release]';
	const key = `followthrough.notes.active-actions.${actionNote.accountId}`;
	const release = Promise.withResolvers<void>();
	try {
		const document = {
			type: 'doc',
			content: [{ type: 'mermaid', content: [{ type: 'text', text: source }] }]
		};
		await sql`update notes set document = ${sql.json(document)}, plain_text = ${source} where id = ${actionNote.noteId}`;
		await sql`insert into conversations (id, user_id, kind, context_note_id, title) values (${conversationId}, ${actionNote.accountId}, 'workflow', ${actionNote.noteId}, 'Diagram revision')`;
		await sql`insert into provenance (id, user_id, producer_kind, producer_name, pipeline, run_id, model, metadata) values (${provenanceId}, ${actionNote.accountId}, 'agent', 'Diagram Agent', 'agent', ${runId}, 'test/model', ${sql.json({ conversationId, operation: 'revise' })})`;
		const context = {
			kind: 'diagram_action',
			prepared: {
				provenanceId,
				context: {
					noteId: actionNote.noteId,
					noteTitle: 'Release workflow',
					contextNotes: [],
					contextResources: [],
					skills: { items: [] }
				}
			},
			model: 'test/model',
			input: {
				operation: 'revise',
				noteId: actionNote.noteId,
				source,
				instruction: 'Label the completed release'
			}
		};
		await sql`insert into agent_runs (id, kind, user_id, conversation_id, model, execution_mode, status, context_snapshot, started_at, finished_at) values (${runId}, 'workflow', ${actionNote.accountId}, ${conversationId}, 'test/model', 'auto_accept', 'completed', ${sql.json(context)}, now(), now())`;
		await sql`insert into agent_run_events (run_id, attempt, event) values (${runId}, 1, ${sql.json({ type: 'workflow_result', action: 'revise', result: { source: revised } })}), (${runId}, 1, ${sql.json({ type: 'completed', runId, conversationId, model: 'test/model' })})`;
		await page.addInitScript(
			({ storageKey, run }) => {
				if (!sessionStorage.getItem('action-recovery-seeded')) {
					sessionStorage.setItem(storageKey, JSON.stringify([run]));
					sessionStorage.setItem('action-recovery-seeded', 'true');
				}
			},
			{
				storageKey: key,
				run: {
					runId,
					noteId: actionNote.noteId,
					action: 'revise',
					cursor: '0',
					context: { source }
				}
			}
		);
		await page.route(`**/api/agent/runs/${runId}/events?*`, async (route) => {
			await release.promise;
			await route.continue();
		});
		await page.goto(`/notes/${actionNote.noteId}`);
		await page.getByRole('textbox', { name: 'Note body', exact: true }).waitFor();
		await page.locator('.mermaid-container svg').waitFor();
		const evidence = process.env.NOTE_ACTION_EVIDENCE;
		if (evidence) await page.screenshot({ path: `${evidence}/hydration-pending.png` });
		release.resolve();
		await expect
			.poll(async () => ({
				storedSource: (
					await sql`select document->'content'->0->'content'->0->>'text' as source from notes where id = ${actionNote.noteId}`
				)[0]?.source,
				pending: await page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key)
			}))
			.toEqual({ storedSource: revised, pending: null });
		if (evidence) {
			await page.getByText('Approved release', { exact: true }).first().waitFor();
			await page.screenshot({ path: `${evidence}/hydration-revised.png` });
		}
	} finally {
		release.resolve();
		await sql.end();
	}
});

test('hydrated queued selection action can be cancelled without executing a model', async ({
	page,
	actionNote
}) => {
	await page.request.get('/auth/login');
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('Missing local database');
	const sql = postgres(databaseUrl, { max: 1 });
	const runId = randomUUID();
	const conversationId = randomUUID();
	const key = `followthrough.notes.active-actions.${actionNote.accountId}`;
	try {
		await sql`insert into conversations (id, user_id, kind, context_note_id, title) values (${conversationId}, ${actionNote.accountId}, 'workflow', ${actionNote.noteId}, 'Promise extraction')`;
		await sql`insert into agent_runs (id, kind, user_id, conversation_id, model, execution_mode, status, context_snapshot) values (${runId}, 'workflow', ${actionNote.accountId}, ${conversationId}, 'test/model', 'auto_accept', 'queued', ${sql.json({ kind: 'promise_extraction', generation: { kind: 'rules' }, selection: { noteId: actionNote.noteId, revision: 1, from: 0, to: 54, text: 'We will review the proposal, then approve the release.' } })})`;
		await sql`insert into agent_run_events (run_id, attempt, event) values (${runId}, 1, ${sql.json({ type: 'run_queued', runId, attempt: 1, reason: 'submitted' })})`;
		await page.addInitScript(
			({ storageKey, run }) => sessionStorage.setItem(storageKey, JSON.stringify([run])),
			{
				storageKey: key,
				run: { runId, noteId: actionNote.noteId, action: 'promises', cursor: '0', context: {} }
			}
		);
		await page.goto(`/notes/${actionNote.noteId}`);
		const body = page.getByRole('textbox', { name: 'Note body', exact: true });
		await body.click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.getByRole('button', { name: /Cancel reading for commitments/i }).click();
		await expect
			.poll(async () => ({
				status: (await sql`select status from agent_runs where id = ${runId}`)[0]?.status,
				pending: await page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key)
			}))
			.toEqual({ status: 'cancelled', pending: null });
	} finally {
		await sql.end();
	}
});

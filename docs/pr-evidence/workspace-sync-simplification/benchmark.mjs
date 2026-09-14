import { GenericContainer, Wait } from 'testcontainers';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, openSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [cwd, label, output] = process.argv.slice(2);
if (!cwd || !label || !output) throw new Error('Usage: benchmark.mjs WORKTREE LABEL OUTPUT');
mkdirSync(output, { recursive: true });
const log = openSync(resolve(output, `${label}-server.log`), 'w');
const container = await new GenericContainer('pgvector/pgvector:pg17')
	.withEnvironment({ POSTGRES_DB: 'benchmark', POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test' })
	.withExposedPorts(5432)
	.withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
	.start();
const databaseUrl = `postgres://test:test@${container.getHost()}:${container.getMappedPort(5432)}/benchmark`;
const sql = postgres(databaseUrl, { max: 1 });
let server, browser, page, started;
const requests = [];
const bodies = [];
const user = '00000000-0000-4000-8000-000000000001',
	project = '00000000-0000-4000-8000-000000000002',
	note = '00000000-0000-4000-8000-000000000003',
	chat = '00000000-0000-4000-8000-000000000004';
const port = label === 'before' ? 4183 : 4184;
const base = `http://127.0.0.1:${port}`;
const env = {
	...process.env,
	CONFIG_SOURCE: 'env',
	LOG_LEVEL: 'error',
	DATABASE_URL: databaseUrl,
	LOCAL_USER_ID: user,
	MISTRAL_API_KEY: 'benchmark-not-used',
	OPENROUTER_API_KEY: 'benchmark-not-used',
	OPENROUTER_BASE_URL: 'http://127.0.0.1:9'
};
const run = (args) =>
	new Promise((resolve, reject) => {
		const p = spawn('pnpm', args, { cwd, env, stdio: ['ignore', log, log] });
		p.on('error', reject);
		p.on('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`pnpm ${args.join(' ')} failed (${code})`))
		);
	});
try {
	await migrate(drizzle(sql), { migrationsFolder: resolve(cwd, 'drizzle') });
	await sql`insert into users (id,email,display_name,role) values (${user}, 'benchmark@local.invalid', 'Workspace benchmark', 'USER')`;
	await sql`insert into projects (id,user_id,name,role) values (${project},${user},'Inbox','inbox')`;
	const paragraph =
		'A durable offline edit must survive a closed tab, a lost response, and another writer. The client records intent before displaying success, then compares the observed revision when it reconnects.';
	const document = {
		type: 'doc',
		content: [
			{
				type: 'heading',
				attrs: { level: 2 },
				content: [{ type: 'text', text: 'Offline workspace design' }]
			},
			...Array.from({ length: 30 }, (_, i) => ({
				type: 'paragraph',
				content: [{ type: 'text', text: `${i + 1}. ${paragraph}` }]
			}))
		]
	};
	await sql`insert into notes (id,user_id,project_id,kind,title,document,plain_text) values (${note},${user},${project},'note','Offline workspace design',${JSON.stringify(document)}::jsonb,${paragraph.repeat(30)})`;
	await sql`insert into conversations (id,user_id,title) values (${chat},${user},'Architecture discussion')`;
	const rich =
		`## Review\n\n${paragraph}\n\n- Keep the observed version.\n- Retry the same operation.\n\n\`\`\`ts\nawait transaction.commit();\n\`\`\`\n\n| State | Action |\n| --- | --- |\n| Offline | Persist |\n`.repeat(
			6
		);
	await sql`insert into messages (id,conversation_id,role,content) select ('50000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,${chat},'user',jsonb_build_object('type','text','text',${rich} || n::text) from generate_series(1,5000) n`;
	await sql`insert into provenance (id,user_id,producer_kind,producer_name,pipeline,run_id,model,metadata) select ('60000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,${user},'agent','FollowThrough Workbench Agent','agent',('70000000-0000-4000-8000-' || lpad(n::text,12,'0')),'benchmark-model','{}'::jsonb from generate_series(1,2000) n`;
	const token = randomBytes(32).toString('hex');
	await sql`insert into sessions(id,user_id,expires_at) values(${token},${user},now()+interval '1 day')`;
	console.log(`${label}: seeded 5000 messages and 2000 provenance rows; building`);
	if (!process.env.SKIP_BENCHMARK_BUILD) await run(['build:web']);
	server = spawn(
		'pnpm',
		['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
		{ cwd, env, stdio: ['ignore', log, log], detached: true }
	);
	const until = Date.now() + 60000;
	while (true) {
		try {
			const res = await fetch(base);
			if (res.ok) break;
		} catch (error) {
			if (Date.now() > until) throw error;
		}
		if (Date.now() > until) throw new Error('Preview did not start');
		await new Promise((r) => setTimeout(r, 200));
	}
	browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		colorScheme: 'light'
	});
	await context.addCookies([{ name: 'session', value: token, url: base }]);
	page = await context.newPage();
	page.setDefaultTimeout(300000);
	await page.addInitScript(() => {
		window.__longTasks = [];
		new PerformanceObserver((list) =>
			window.__longTasks.push(
				...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration }))
			)
		).observe({ type: 'longtask', buffered: true });
	});
	page.on('response', (res) => {
		if (res.url().includes('/_app/remote/')) {
			const entry = {
				method: res.request().method(),
				name: new URL(res.url()).pathname.split('/').at(-1),
				status: res.status(),
				bytes: 0
			};
			requests.push(entry);
			bodies.push(
				res
					.body()
					.then((b) => {
						entry.bytes = b.length;
					})
					.catch((error) => {
						entry.failure = error.message;
					})
			);
		}
	});
	page.on('console', (msg) => {
		if (msg.type() === 'error') console.log('Browser console:', msg.text());
	});
	page.on('pageerror', (err) => console.log(`${label} page error: ${err.message}`));
	started = performance.now();
	await page.goto(`${base}/today`);
	console.log(`${label}: document loaded`);
	await Promise.race([
		page.getByRole('heading', { name: 'Today', exact: true }).waitFor(),
		page
			.getByText("This page didn't load", { exact: true })
			.waitFor()
			.then(() => {
				throw new Error('Workspace startup failed');
			})
	]);
	console.log(`${label}: first view usable`);
	const firstUsableMs = performance.now() - started;
	await page
		.getByRole('button', { name: 'Sync status: Everything is saved', exact: true })
		.waitFor();
	const fullSyncMs = performance.now() - started;
	const longTasks = await page.evaluate(() => window.__longTasks);
	const coldRequests = [...requests];
	await Promise.all(bodies);
	const inventory = await page.evaluate(async () => {
		const databases = await indexedDB.databases();
		const dbName = databases.find((db) => db.name.startsWith('followthrough-workspace-sync'))?.name;
		if (!dbName) throw new Error('No workspace database');
		const db = await new Promise((resolve, reject) => {
			const request = indexedDB.open(dbName);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const rows = await new Promise((resolve, reject) => {
			const request = db.transaction('records').objectStore('records').getAll();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		db.close();
		return {
			stored: rows.length,
			bodies: rows.filter((row) => row.entry?.snapshot || row.entry?.body).length
		};
	});
	await page.screenshot({ path: resolve(output, `${label}-today.png`) });
	await page.goto(`${base}/notes/${note}`);
	await page.locator('[data-note-pane] [contenteditable=true]').first().waitFor();
	await page
		.getByRole('button', { name: 'Sync status: Everything is saved', exact: true })
		.waitFor();
	await page.evaluate(() => navigator.serviceWorker.ready);
	await context.setOffline(true);
	const warm = performance.now();
	await page.reload();
	await page.locator('[data-note-pane] [contenteditable=true]').first().waitFor();
	const cachedOfflineOpenMs = performance.now() - warm;
	await page.screenshot({ path: resolve(output, `${label}-offline-note.png`) });
	const grouped = {};
	for (const r of coldRequests) {
		const item = (grouped[r.name] ??= { requests: 0, bytes: 0 });
		item.requests++;
		item.bytes += r.bytes;
	}
	const metrics = {
		label,
		commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
		fixture: {
			messages: 5000,
			provenance: 2000,
			messageTextBytes: Buffer.byteLength(rich),
			noteDocumentBytes: Buffer.byteLength(JSON.stringify(document))
		},
		firstUsableMs,
		fullSyncMs,
		cachedOfflineOpenMs,
		inventory,
		remoteRequests: coldRequests.length,
		responseFailures: coldRequests.filter((request) => request.failure),
		decodedRemoteBytes: coldRequests.reduce((n, r) => n + r.bytes, 0),
		longTasks: {
			count: longTasks.length,
			totalMs: longTasks.reduce((n, e) => n + e.duration, 0),
			maxMs: Math.max(0, ...longTasks.map((e) => e.duration))
		},
		grouped
	};
	writeFileSync(resolve(output, `${label}-metrics.json`), JSON.stringify(metrics, null, 2));
	console.log(JSON.stringify(metrics));
	if (label === 'after' && !process.env.METRICS_ONLY) {
		await page.goto(`${base}/today`);
		await page.locator('#quick-capture-input').fill('Captured while offline');
		await page.getByRole('button', { name: 'Create note', exact: true }).click();
		await page.locator('[data-note-pane] [contenteditable=true]').first().waitFor();
		await page.screenshot({ path: resolve(output, 'after-offline-capture.png') });
		await context.setOffline(false);
		await page
			.getByRole('button', { name: 'Sync status: Everything is saved', exact: true })
			.waitFor();
		await page.evaluate(async () => {
			const name = (await indexedDB.databases()).find((db) =>
				db.name.startsWith('followthrough-workspace-sync')
			).name;
			const db = await new Promise((resolve, reject) => {
				const request = indexedDB.open(name);
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			await new Promise((resolve, reject) => {
				const tx = db.transaction('records', 'readwrite');
				tx.objectStore('records').put({
					key: 'damaged-benchmark-row',
					entry: { kind: 'present', snapshot: 'Damaged benchmark row' }
				});
				tx.oncomplete = resolve;
				tx.onabort = () => reject(tx.error);
			});
			db.close();
		});
		await page.reload();
		await page.getByRole('button', { name: 'Download saved data', exact: true }).waitFor();
		const downloaded = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Download saved data', exact: true }).click();
		if (!readFileSync(await (await downloaded).path(), 'utf8').includes('Damaged benchmark row'))
			throw new Error('The raw export lost the damaged row');
		await page.getByRole('button', { name: 'Reset this device…', exact: true }).click();
		await page.getByRole('group', { name: 'Confirm workspace reset' }).waitFor();
		await page.screenshot({ path: resolve(output, 'after-recovery-confirmation.png') });
		await page.getByRole('button', { name: 'Reset local workspace', exact: true }).click();
		await page.locator('[data-note-pane] [contenteditable=true]').first().waitFor();
		await page
			.getByRole('button', { name: 'Sync status: Everything is saved', exact: true })
			.waitFor();
		await page.screenshot({ path: resolve(output, 'after-recovery-restored.png') });
		console.log('after: offline capture, raw export and confirmed reset passed');
	}
	await context.close();
} catch (error) {
	if (page) {
		await page.screenshot({ path: resolve(output, `${label}-failure.png`) });
		console.log('Page text:', await page.locator('body').innerText());
		await Promise.all(bodies);
		writeFileSync(
			resolve(output, `${label}-failure-metrics.json`),
			JSON.stringify(
				{
					label,
					commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
					error: error.message,
					elapsedMs: started ? performance.now() - started : null,
					firstUsableMs: null,
					fullSyncMs: null,
					remoteRequests: requests.length,
					decodedRemoteBytes: requests.reduce((n, r) => n + r.bytes, 0),
					longTasks: await page.evaluate(() => window.__longTasks),
					requests
				},
				null,
				2
			)
		);
	}
	throw error;
} finally {
	await browser?.close();
	if (server?.pid) {
		try {
			process.kill(-server.pid, 'SIGTERM');
		} catch (error) {
			if (error.code !== 'ESRCH') console.error('Preview cleanup failed:', error);
		}
	}
	await sql.end();
	await container.stop();
}

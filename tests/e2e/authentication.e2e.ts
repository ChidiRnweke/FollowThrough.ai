import { expect, test } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';

// Exercise the real HTTP boundaries with isolated accounts and no OAuth provider calls.
test.use({ storageState: { cookies: [], origins: [] } });

const accounts = ['USER', 'WAITING', 'ADMIN'].map((role) => ({
	id: randomUUID(),
	role,
	session: randomBytes(32).toString('hex')
}));
const credentials = (['read', 'full'] as const).map((scope) => ({
	scope,
	plaintext: `ftm_${randomBytes(32).toString('hex')}`
}));

const database = () => {
	if (!process.env.DATABASE_URL)
		throw new Error('DATABASE_URL is required for authentication tests');
	return postgres(process.env.DATABASE_URL, { max: 1 });
};

test.beforeAll(async () => {
	const sql = database();
	try {
		for (const account of accounts) {
			await sql`insert into users (id, email, display_name, role)
				values (${account.id}, ${`${account.id}@example.test`}, 'Authentication test', ${account.role})`;
			await sql`insert into sessions (id, user_id, expires_at)
				values (${account.session}, ${account.id}, now() + interval '1 day')`;
		}
		for (const credential of credentials) {
			const hash = createHash('sha256').update(credential.plaintext).digest('hex');
			await sql`insert into api_tokens (user_id, name, token_hash, scope)
				values (${accounts[0].id}, 'Authentication test', ${hash}, ${credential.scope})`;
		}
	} finally {
		await sql.end();
	}
});

test.afterAll(async () => {
	const sql = database();
	try {
		await sql`delete from users where id in ${sql(accounts.map((account) => account.id))}`;
	} finally {
		await sql.end();
	}
});

for (const cookie of ['', 'session=invalid-session']) {
	test(`workspace requires a valid session (${cookie || 'no cookie'})`, async ({ request }) => {
		const response = await request.get('/today', {
			headers: { cookie },
			maxRedirects: 0
		});
		expect({ status: response.status(), location: response.headers().location }).toEqual({
			status: 303,
			location: '/auth/login'
		});
	});
}

for (const account of accounts) {
	test(`session selects its own ${account.role} account and preserves role gating`, async ({
		request
	}) => {
		const response = await request.get(
			account.role === 'WAITING' ? '/today' : account.role === 'ADMIN' ? '/waiting' : '/_admin',
			{
				headers: { cookie: `session=${account.session}` },
				maxRedirects: 0
			}
		);
		const expected = { status: 303, location: account.role === 'WAITING' ? '/waiting' : '/today' };
		expect({
			status: response.status(),
			location: response.headers().location,
			accountCookie: response.headers()['set-cookie'].includes(`workspace_account=${account.id};`)
		}).toEqual({ ...expected, accountCookie: true });
	});
}

test('a valid session opens the workspace in the browser', async ({ page, context, baseURL }) => {
	if (!baseURL) throw new Error('A base URL is required');
	await context.addCookies([{ name: 'session', value: accounts[0].session, url: baseURL }]);
	await page.goto('/today');
	await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});

for (const authorization of ['', 'Bearer ftm_invalid']) {
	test(`MCP rejects an unverified credential (${authorization || 'no header'})`, async ({
		request
	}) => {
		// A valid browser session cannot substitute for an API token.
		const response = await request.post('/mcp', {
			headers: { authorization, cookie: `session=${accounts[0].session}` },
			data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
		});
		expect({
			status: response.status(),
			challenge: response.headers()['www-authenticate']
		}).toEqual({
			status: 401,
			challenge: 'Bearer realm="followthrough"'
		});
	});
}

for (const credential of credentials) {
	test(`MCP preserves the verified token's ${credential.scope} scope`, async ({ request }) => {
		const response = await request.post('/mcp', {
			headers: {
				authorization: `Bearer ${credential.plaintext}`,
				accept: 'application/json, text/event-stream'
			},
			data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
		});
		const body = await response.json();
		const names = body.result.tools.map((tool: { name: string }) => tool.name);
		expect({
			status: response.status(),
			canRead: names.includes('get_note'),
			canWrite: names.includes('save_note')
		}).toEqual({ status: 200, canRead: true, canWrite: credential.scope === 'full' });
	});
}

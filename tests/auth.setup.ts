import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import postgres from 'postgres';

const LOCAL_USER_FALLBACK = '00000000-0000-4000-8000-000000000001';
const SESSION_TTL_DAYS = 30;
const stateFile = fileURLToPath(new URL('.auth/state.json', import.meta.url));

const generateSessionId = () => randomBytes(32).toString('hex');

const readCachedToken = (): string | undefined => {
	try {
		const state = JSON.parse(readFileSync(stateFile, 'utf8'));
		return state.cookies?.find((cookie: { name: string }) => cookie.name === 'session')?.value;
	} catch {
		return undefined;
	}
};

const writeState = (token: string) => {
	mkdirSync(dirname(stateFile), { recursive: true });
	writeFileSync(
		stateFile,
		JSON.stringify({
			cookies: [
				{
					name: 'session',
					value: token,
					domain: '127.0.0.1',
					path: '/',
					expires: -1,
					httpOnly: true,
					secure: false,
					sameSite: 'Lax'
				}
			],
			origins: []
		})
	);
};

/**
 * Keeps auth enabled for e2e: mints a session row directly (like a cached
 * login, no Authentik round-trip) for the local user who owns the test data,
 * and caches the token in tests/.auth/state.json until it expires.
 */
export default async function globalSetup() {
	loadDotenv({ quiet: true });

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is required to mint the e2e session');
	const userId = process.env.LOCAL_USER_ID ?? LOCAL_USER_FALLBACK;

	const sql = postgres(databaseUrl, { max: 1 });
	try {
		// The app auto-provisions this row with role WAITING, which hooks would
		// lock to /waiting — force a usable role.
		await sql`
			insert into users (id, email, display_name, role)
			values (${userId}, ${`${userId}@local.invalid`}, 'Architect', 'USER')
			on conflict (id) do update set role = 'USER'
		`;

		const cached = readCachedToken();
		if (cached) {
			const valid = await sql`
				select 1 from sessions
				where id = ${cached} and user_id = ${userId} and expires_at > now()
			`;
			if (valid.length > 0) {
				console.log('[e2e auth] Reused cached session token');
				return;
			}
		}

		const token = generateSessionId();
		const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
		await sql`
			insert into sessions (id, user_id, expires_at)
			values (${token}, ${userId}, ${expiresAt})
		`;
		writeState(token);
		console.log('[e2e auth] Minted fresh session token');
	} finally {
		await sql.end();
	}
}

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { sessionTokenSchema } from '$lib/models/identity';
import { SessionRecords } from '$lib/server/repositories/identity/postgres/sessions';
import { UserAccountRecords } from '$lib/server/repositories/identity/postgres/users';
import { SessionRegistry } from '$lib/server/services/identity/sessions';
import { context } from '../database-harness';

const day = 24 * 60 * 60 * 1000;

/** The data step of the migration that rewrites stored session tokens as their digests. */
const rewriteStatement = readFileSync(
	new URL('../../../drizzle/0080_session_digests.sql', import.meta.url),
	'utf8'
)
	.split('--> statement-breakpoint')
	.find((statement) => statement.includes('UPDATE'));

it('keeps a session stored before the digest migration signed in by its cookie token', async () => {
	if (!rewriteStatement) throw new Error('The migration has no rewrite statement');
	const user = await new UserAccountRecords(context.db).create({
		email: `session-digest-${crypto.randomUUID()}@example.test`,
		displayName: 'Session digest contract',
		role: 'USER'
	});
	const token = sessionTokenSchema.parse(randomBytes(32).toString('hex'));
	// The harness has applied every migration, so the statement runs against a temporary copy of
	// the table, which shadows `sessions` inside this transaction and is dropped at its end.
	const resumed = await context.db.transaction(async (tx) => {
		await tx.execute(
			sql`create temporary table sessions (like public.sessions including all) on commit drop`
		);
		await tx.execute(
			sql`insert into sessions (id, user_id, expires_at) values (${token}, ${user.id}, ${new Date(Date.now() + 30 * day).toISOString()})`
		);
		await tx.execute(sql.raw(rewriteStatement));
		const registry = new SessionRegistry(new SessionRecords(tx), { maxLifetimeMs: 90 * day });
		const stored = await tx.execute<{ id: string }>(sql`select id from sessions`);
		return {
			user: (await registry.validateSession(token))?.user.id,
			storedToken: stored.some(({ id }) => id === token)
		};
	});
	expect(resumed).toEqual({ user: user.id, storedToken: false });
});

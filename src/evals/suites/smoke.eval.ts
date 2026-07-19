import { describe, expect, it, inject } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '$lib/server/db/schema';

describe('evals lab harness', () => {
	it('exposes a migrated database with pgvector available', async () => {
		const client = postgres(inject('databaseUrl'), { max: 1 });
		const db = drizzle(client, { schema });
		try {
			const [extension] = await db.execute<{ count: number }>(
				sql`select count(*)::int as count from pg_extension where extname = 'vector'`
			);
			expect(extension.count).toBe(1);
		} finally {
			await client.end();
		}
	});
});

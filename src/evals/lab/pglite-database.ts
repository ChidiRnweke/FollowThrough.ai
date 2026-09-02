import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import type { Database } from '$lib/server/db';
import type { TransactionRunner } from '$lib/server/repositories/workspace';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../drizzle', import.meta.url));

/**
 * Drizzle's migration journal, as this reader uses it.
 *
 * The annotation this replaced checked nothing — `JSON.parse` returns `any`, so
 * `const journal: MigrationJournal = JSON.parse(...)` was an assertion wearing a
 * type annotation. A journal missing `entries` therefore failed at
 * `journal.entries` with a `TypeError` about `undefined`, several frames from
 * the file that was actually wrong. Only `tag` is named because only `tag` is
 * read; the journal also carries `version`, `dialect`, and per-entry `idx`,
 * `when` and `breakpoints`, so the object stays open.
 */
export const migrationJournalSchema = z.object({
	entries: z.array(z.object({ tag: z.string() }))
});

/**
 * In-process PGlite database with pgvector, migrated and ready for use.
 *
 * Starts in ~4s (vs ~15s for testcontainer), needs no Docker, and works on any
 * platform with Node. The drizzle PGlite adapter is structurally identical to
 * the postgres-js adapter for query purposes, so all repository code runs
 * unmodified.
 */
export async function createPGliteDatabase(): Promise<{
	database: Database;
	transactionRunner: TransactionRunner;
	close: () => Promise<void>;
}> {
	const client = new PGlite({ extensions: { vector } });
	const db = drizzle(client, { schema });

	// Run all migrations using exec() to support multi-statement SQL
	const journalFile: unknown = JSON.parse(
		await readFile(join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8')
	);
	// Loud on purpose: this runs at eval-lab startup, and an unreadable journal
	// means a database with no schema, which every case downstream would report
	// as its own failure.
	const journal = migrationJournalSchema.parse(journalFile);
	await client.exec(
		'CREATE TABLE IF NOT EXISTS __drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)'
	);
	for (const entry of journal.entries) {
		const sql = await readFile(join(MIGRATIONS_FOLDER, entry.tag + '.sql'), 'utf8');
		const statements = sql
			.split('--> statement-breakpoint')
			.map((s) => s.trim())
			.filter(Boolean);
		for (const stmt of statements) {
			await client.exec(stmt);
		}
		await client.exec(
			`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('${entry.tag}', ${Date.now()})`
		);
	}

	const database: Database = db;
	const transactions = createTransactionContext(database);

	return {
		database: transactions.database,
		transactionRunner: transactions.transactionRunner,
		close: () => client.close()
	};
}

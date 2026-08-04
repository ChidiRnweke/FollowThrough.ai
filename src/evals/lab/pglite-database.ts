import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import type { Database } from '$lib/server/db';
import type { TransactionRunner } from '$lib/server/repositories/workspace';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../drizzle', import.meta.url));

interface MigrationJournal {
	entries: { tag: string }[];
}

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
	const journal: MigrationJournal = JSON.parse(
		await readFile(join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8')
	);
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

	// The PGlite drizzle adapter is structurally compatible with postgres-js for
	// all query-builder and transaction operations. The cast is safe because
	// drizzle's Pg types share the same runtime interface.
	const { database, transactionRunner } = createTransactionContext(db as unknown as Database);

	return {
		database,
		transactionRunner,
		close: () => client.close()
	};
}

/* eslint-disable @typescript-eslint/ban-ts-comment -- Node executes this JavaScript entrypoint directly. */
// @ts-nocheck -- behaviour and dependency contracts are covered by Vitest fakes.
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { initializeConfig } from './config-service.js';

export async function runMigrations(
	databaseUrl,
	{ postgresClient = postgres, migrateDatabase = migrate } = {}
) {
	const client = postgresClient(databaseUrl, { max: 1 });
	try {
		await migrateDatabase(drizzle(client), { migrationsFolder: './drizzle' });
	} finally {
		await client.end();
	}
}

async function main() {
	await initializeConfig();
	await runMigrations(process.env.DATABASE_URL);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

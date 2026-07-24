import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { createTransactionContext } from './transaction-context';

function createDatabase(databaseUrl: string) {
	return drizzle(postgres(databaseUrl), { schema });
}

export type Database = ReturnType<typeof createDatabase>;

let database: Database | undefined;

function runtimeDatabase(): Database {
	if (database) return database;
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is not set');
	database = createDatabase(databaseUrl);
	return database;
}

const lazyDatabase = new Proxy({} as Database, {
	get(_target, property) {
		const active = runtimeDatabase();
		const value = Reflect.get(active, property, active) as unknown;
		return typeof value === 'function' ? value.bind(active) : value;
	}
});
const transactions = createTransactionContext(lazyDatabase);

export const db = transactions.database;
export const postgresTransactionRunner = transactions.transactionRunner;

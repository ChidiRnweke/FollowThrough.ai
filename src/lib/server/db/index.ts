import { drizzle } from 'drizzle-orm/postgres-js';
import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';
import type { TransactionRunner } from '$lib/repositories';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = postgres(DATABASE_URL);
const database = drizzle(client, { schema });
export type Database = typeof database;
const transactionContext = new AsyncLocalStorage<Database>();

export const db = new Proxy(database, {
	get(target, property) {
		const active = transactionContext.getStore() ?? target;
		const value = Reflect.get(active, property, active) as unknown;
		return typeof value === 'function' ? value.bind(active) : value;
	}
});

export const postgresTransactionRunner: TransactionRunner = {
	run<T>(work: () => Promise<T>): Promise<T> {
		if (transactionContext.getStore()) return work();
		return database.transaction((transaction) =>
			transactionContext.run(transaction as unknown as Database, work)
		);
	}
};

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';
import { createTransactionContext } from './transaction-context';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = postgres(DATABASE_URL);
const database = drizzle(client, { schema });
export type Database = typeof database;
const transactions = createTransactionContext(database);

export const db = transactions.database;
export const postgresTransactionRunner = transactions.transactionRunner;

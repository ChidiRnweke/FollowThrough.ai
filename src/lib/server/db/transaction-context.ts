import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { isRetryableTransactionError } from './postgres-errors';
import type { TransactionRunner } from '$lib/server/repositories/workspace';

interface TransactionalDatabase {
	transaction<T>(work: (transaction: unknown) => Promise<T>): Promise<T>;
}

export function createTransactionContext<TDatabase extends TransactionalDatabase>(
	database: TDatabase
): {
	database: TDatabase;
	transactionRunner: TransactionRunner;
	connectionScope: { run<T>(database: TDatabase, work: () => Promise<T>): Promise<T> };
} {
	const context = new AsyncLocalStorage<{ database: TDatabase; transactional: boolean }>();
	const contextualDatabase = new Proxy(database, {
		get(target, property) {
			const active = context.getStore()?.database ?? target;
			const value = Reflect.get(active, property, active) as unknown;
			return typeof value === 'function' ? value.bind(active) : value;
		}
	});
	return {
		database: contextualDatabase,
		connectionScope: {
			run: (database, work) => context.run({ database, transactional: false }, work)
		},
		transactionRunner: {
			async run<T>(
				work: () => Promise<T>,
				options: { readonly retry: 'database-only' | 'never' } = { retry: 'never' }
			): Promise<T> {
				const active = context.getStore();
				if (active?.transactional) return work();
				const connection = active?.database ?? database;
				for (let attempt = 0; ; attempt++) {
					try {
						return await connection.transaction((transaction) =>
							context.run({ database: transaction as TDatabase, transactional: true }, work)
						);
					} catch (error) {
						if (
							options.retry === 'database-only' &&
							isRetryableTransactionError(error) &&
							attempt < 3
						) {
							await delay(50 * 2 ** attempt);
							continue;
						}
						throw error;
					}
				}
			}
		}
	};
}

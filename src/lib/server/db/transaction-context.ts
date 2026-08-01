import { AsyncLocalStorage } from 'node:async_hooks';
import type { TransactionRunner } from '$lib/server/repositories/workspace';

interface TransactionalDatabase {
	transaction<T>(work: (transaction: unknown) => Promise<T>): Promise<T>;
}

export function createTransactionContext<TDatabase extends TransactionalDatabase>(
	database: TDatabase
): { database: TDatabase; transactionRunner: TransactionRunner } {
	const context = new AsyncLocalStorage<TDatabase>();
	const contextualDatabase = new Proxy(database, {
		get(target, property) {
			const active = context.getStore() ?? target;
			const value = Reflect.get(active, property, active) as unknown;
			return typeof value === 'function' ? value.bind(active) : value;
		}
	});
	return {
		database: contextualDatabase,
		transactionRunner: {
			run<T>(work: () => Promise<T>): Promise<T> {
				if (context.getStore()) return work();
				return database.transaction((transaction) => context.run(transaction as TDatabase, work));
			}
		}
	};
}

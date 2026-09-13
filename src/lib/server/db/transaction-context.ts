import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { ValidationError } from '$lib/errors';
import { isRetryableTransactionError, isPermanentWriteConstraint } from './postgres-errors';
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
			async run<T>(
				work: () => Promise<T>,
				options: { readonly retry: 'database-only' | 'never' } = { retry: 'never' }
			): Promise<T> {
				if (context.getStore()) return work();
				for (let attempt = 0; ; attempt++) {
					try {
						return await database.transaction((transaction) =>
							context.run(transaction as TDatabase, work)
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
						if (isPermanentWriteConstraint(error)) {
							const rejected = new ValidationError(
								'This change no longer matches the workspace records. Review or discard the change.'
							);
							rejected.cause = error;
							throw rejected;
						}
						throw error;
					}
				}
			}
		}
	};
}

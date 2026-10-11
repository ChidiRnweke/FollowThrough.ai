import type { AtomicOperationOptions } from '$lib/models/workspace';
import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { isRetryableTransactionError } from './postgres-errors';
import type { TransactionRunner } from '$lib/server/repositories/workspace';

interface TransactionalDatabase {
	transaction<T>(
		work: (transaction: unknown) => Promise<T>,
		options?: { isolationLevel: 'repeatable read'; accessMode: 'read only' }
	): Promise<T>;
}

export function createTransactionContext<TDatabase extends TransactionalDatabase>(
	database: TDatabase
): {
	database: TDatabase;
	transactionRunner: TransactionRunner;
	connectionScope: {
		database: TDatabase;
		run<T>(database: TDatabase, work: () => Promise<T>): Promise<T>;
	};
} {
	const context = new AsyncLocalStorage<
		| { database: TDatabase; kind: 'connection' }
		| { database: TDatabase; kind: 'transaction'; mode: 'default' | 'read-only-snapshot' }
	>();
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
			database: contextualDatabase,
			run: (database, work) => context.run({ database, kind: 'connection' }, work)
		},
		transactionRunner: {
			async run<T>(
				work: () => Promise<T>,
				options: AtomicOperationOptions = { retry: 'never' }
			): Promise<T> {
				const active = context.getStore();
				const mode = options.mode ?? 'default';
				if (active?.kind === 'transaction') {
					if (active.mode !== mode)
						throw new Error(
							'The active transaction has an incompatible synchronization snapshot mode'
						);
					return work();
				}
				const connection = active?.database ?? database;
				for (let attempt = 0; ; attempt++) {
					try {
						return await connection.transaction(
							(transaction) =>
								context.run(
									{ database: transaction as TDatabase, kind: 'transaction', mode },
									work
								),
							mode === 'read-only-snapshot'
								? { isolationLevel: 'repeatable read', accessMode: 'read only' }
								: undefined
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

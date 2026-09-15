import { describe, expect, it } from 'vitest';
import { InMemoryDatabaseTransactions } from '$lib/testing/workspace/fakes/in-memory-database-transactions';
import { createTransactionContext } from './transaction-context';
const deadlock = () =>
	new Error('Driver wrapper', { cause: Object.assign(new Error('Deadlock'), { code: '40P01' }) });
describe('outer transaction recovery', () => {
	it('replays database-only work after rollback without duplicating committed data', async () => {
		const database = new InMemoryDatabaseTransactions();
		database.commitFailures.push(deadlock());
		const context = createTransactionContext(database);
		await context.transactionRunner.run(
			async () => {
				context.database.rows.push('saved');
			},
			{ retry: 'database-only' }
		);
		expect(database.rows).toEqual(['saved']);
	});
	it('does not replay work whose external effects have not been declared safe', async () => {
		const database = new InMemoryDatabaseTransactions();
		database.commitFailures.push(deadlock());
		const context = createTransactionContext(database);
		const external: string[] = [];
		await context.transactionRunner
			.run(async () => {
				external.push('upload');
			})
			.catch(() => {
				return { kind: 'failure' };
			});
		expect(external).toEqual(['upload']);
	});
	it('replays nested database work as one complete outer attempt', async () => {
		const database = new InMemoryDatabaseTransactions();
		database.commitFailures.push(Object.assign(new Error('Serialization'), { code: '40001' }));
		const context = createTransactionContext(database);
		await context.transactionRunner.run(
			async () => {
				context.database.rows.push('parent');
				await context.transactionRunner.run(async () => {
					context.database.rows.push('child');
				});
			},
			{ retry: 'database-only' }
		);
		expect(database.rows).toEqual(['parent', 'child']);
	});
	it('preserves constraint failures for the owning capability to classify after rollback', async () => {
		const database = new InMemoryDatabaseTransactions();
		const failure = Object.assign(new Error('Foreign key'), { code: '23503' });
		database.commitFailures.push(failure);
		const context = createTransactionContext(database);
		await expect(
			context.transactionRunner.run(
				async () => {
					context.database.rows.push('invalid');
				},
				{ retry: 'database-only' }
			)
		).rejects.toBe(failure);
	});
	it('surfaces repeated deadlocks when its finite retry budget is exhausted', async () => {
		const database = new InMemoryDatabaseTransactions();
		database.commitFailures.push(deadlock(), deadlock(), deadlock(), deadlock());
		const context = createTransactionContext(database);
		await expect(
			context.transactionRunner.run(
				async () => {
					context.database.rows.push('saved');
				},
				{ retry: 'database-only' }
			)
		).rejects.toThrow('Driver wrapper');
	});
});

it.each(['23502', '23514', '23503'])(
	'preserves unexpected database error %s outside sync',
	async (code) => {
		const database = new InMemoryDatabaseTransactions();
		const failure = Object.assign(new Error('Invalid domain write'), { code });
		database.commitFailures.push(failure);
		const context = createTransactionContext(database);
		await expect(
			context.transactionRunner.run(async () => {
				context.database.rows.push('invalid');
			})
		).rejects.toBe(failure);
	}
);

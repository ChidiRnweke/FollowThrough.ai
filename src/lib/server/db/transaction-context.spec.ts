import { describe, expect, it } from 'vitest';
import { ValidationError } from '$lib/errors';
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
	it('reports a permanent constraint failure as a reviewable rejection after rollback', async () => {
		const database = new InMemoryDatabaseTransactions();
		database.commitFailures.push(Object.assign(new Error('Foreign key'), { code: '23503' }));
		const context = createTransactionContext(database);
		await expect(
			context.transactionRunner.run(
				async () => {
					context.database.rows.push('invalid');
				},
				{ retry: 'database-only' }
			)
		).rejects.toBeInstanceOf(ValidationError);
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

import { expect, it } from 'vitest';
import { createTransactionContext } from './transaction-context';
import { InMemoryDatabaseTransactions } from '$lib/testing/workspace/fakes/in-memory-database-transactions';

const snapshot = { retry: 'never', mode: 'read-only-snapshot' } as const;

it('rejects a snapshot nested inside an ordinary transaction', async () => {
	const { transactionRunner } = createTransactionContext(new InMemoryDatabaseTransactions());
	await expect(
		transactionRunner.run(() => transactionRunner.run(async () => 'invalid', snapshot))
	).rejects.toThrow('incompatible synchronization snapshot mode');
});

it('rejects ordinary transaction work nested inside a read-only snapshot', async () => {
	const { transactionRunner } = createTransactionContext(new InMemoryDatabaseTransactions());
	await expect(
		transactionRunner.run(() => transactionRunner.run(async () => 'invalid'), snapshot)
	).rejects.toThrow('incompatible synchronization snapshot mode');
});

it('reuses a compatible snapshot transaction', async () => {
	const { transactionRunner } = createTransactionContext(new InMemoryDatabaseTransactions());
	expect(
		await transactionRunner.run(() => transactionRunner.run(async () => 'read', snapshot), snapshot)
	).toBe('read');
});

import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import * as schema from '$lib/server/db/schema';
import { actor, context } from '../database-harness';
describe('Postgres transaction context invariants', () => {
	it('rolls back every write when the transaction fails', async () => {
		const owner = actor('41');
		const transactions = createTransactionContext(context.db);
		try {
			await transactions.transactionRunner.run(async () => {
				await transactions.database.insert(schema.users).values({
					id: owner.userId,
					email: 'rollback@local.invalid',
					displayName: 'Rollback'
				});
				throw new Error('force rollback');
			});
		} catch {
			// The absence of the write is the invariant under test.
		}
		const rows = await context.db
			.select({ id: schema.users.id })
			.from(schema.users)
			.where(eq(schema.users.id, owner.userId));
		expect(rows).toEqual([]);
	});
	it('keeps nested work inside the outer transaction', async () => {
		const owner = actor('42');
		const transactions = createTransactionContext(context.db);
		try {
			await transactions.transactionRunner.run(async () => {
				await transactions.database.insert(schema.users).values({
					id: owner.userId,
					email: 'nested@local.invalid',
					displayName: 'Nested'
				});
				await transactions.transactionRunner.run(async () => {
					await transactions.database.insert(schema.projects).values({
						userId: owner.userId,
						name: 'Nested project'
					});
				});
				throw new Error('force outer rollback');
			});
		} catch {
			// Both outer and nested writes must roll back together.
		}
		const rows = await context.db
			.select({ id: schema.projects.id })
			.from(schema.projects)
			.where(eq(schema.projects.userId, owner.userId));
		expect(rows).toEqual([]);
	});
});

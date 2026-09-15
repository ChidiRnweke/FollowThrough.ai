import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { context, seedNote } from '../database-harness';

it('does not add an account-head deadlock to overlapping resource writes', async () => {
	const { owner, project, note } = await seedNote('8823');
	const secondId = crypto.randomUUID();
	await context.client`insert into notes (id, user_id, project_id, kind, title) values (${secondId}, ${owner.userId}, ${project.id}, 'note', 'Second')`;
	const { database, transactionRunner } = createTransactionContext(context.db);
	const other = connectPostgresTestDatabase(context.url);
	const second = createTransactionContext(other.db);
	const firstHasRow = Promise.withResolvers<void>();
	const secondHasRow = Promise.withResolvers<void>();
	try {
		await Promise.all([
			transactionRunner.run(
				async () => {
					await database.execute(
						sql`update notes set title = 'First committed' where id = ${note.id}`
					);
					firstHasRow.resolve();
					await secondHasRow.promise;
					await database.execute(
						sql`update notes set plain_text = 'First operation completed' where id = ${secondId}`
					);
				},
				{ retry: 'never' }
			),
			second.transactionRunner.run(
				async () => {
					await firstHasRow.promise;
					await second.database.execute(
						sql`select id from notes where id = ${secondId} for update`
					);
					secondHasRow.resolve();
					await second.database.execute(
						sql`update notes set title = 'Second committed' where id = ${secondId}`
					);
				},
				{ retry: 'never' }
			)
		]);
	} finally {
		await other.close();
	}
	const rows = await context.client<
		{ title: string }[]
	>`select title from notes where id in (${note.id}, ${secondId}) order by title`;
	expect(rows.map((row) => row.title)).toEqual(['First committed', 'Second committed']);
});

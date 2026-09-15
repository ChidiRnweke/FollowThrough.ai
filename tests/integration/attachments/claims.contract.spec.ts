import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { PostgresAttachmentClaims } from '$lib/server/repositories/attachments/postgres/claims';
import type { AttachmentVersionId } from '$lib/models/attachments';
import { context } from '../database-harness';
const clients: ReturnType<typeof postgres>[] = [];
afterAll(async () => {
	await Promise.all(clients.map((client) => client.end()));
});
const setup = () => {
	const client = postgres(context.url, { max: 3 });
	clients.push(client);
	const transactions = createTransactionContext(drizzle(client, { schema }));
	return {
		client,
		...transactions,
		claims: new PostgresAttachmentClaims(client, transactions.connectionScope),
		versionId: crypto.randomUUID() as AttachmentVersionId
	};
};
describe('attachment processing connection claims', () => {
	it('allows only one worker to claim a version', async () => {
		const { claims, versionId } = setup();
		const result = await claims.withClaim(versionId, () =>
			claims.withClaim(versionId, async () => 'duplicate')
		);
		expect(result).toEqual({ kind: 'claimed', value: { kind: 'busy' } });
	});
	it('uses the claimed connection for transactions and rolls back failed writes', async () => {
		const { claims, versionId, database, transactionRunner } = setup();
		const result = await claims.withClaim(versionId, async (claim) => {
			await database.execute(sql`create temporary table attachment_claim_probe (value integer)`);
			await transactionRunner
				.run(async () => {
					await claim.assertOwned();
					await database.execute(sql`insert into attachment_claim_probe values (1)`);
					throw new Error('Completion failed');
				})
				.then(
					() => {
						throw new Error('Expected failure');
					},
					(error) => {
						if (!(error instanceof Error) || error.message !== 'Completion failed') throw error;
					}
				);
			return (
				await database.execute(sql`select count(*)::integer as count from attachment_claim_probe`)
			)[0]?.count;
		});
		expect(result).toEqual({ kind: 'claimed', value: 0 });
	});
	it('holds a session claim without keeping a transaction open during extraction', async () => {
		const { claims, versionId, database, client, transactionRunner } = setup();
		const result = await claims.withClaim(versionId, async (claim) => {
			await transactionRunner.run(() => claim.assertOwned());
			const [row] = await database.execute(sql`select pg_backend_pid() as pid`);
			const [state] =
				await client`select state from pg_stat_activity where pid = ${Number(row?.pid)}`;
			return state?.state;
		});
		expect(result).toEqual({ kind: 'claimed', value: 'idle' });
	});
	it('refuses completion after the owning session is terminated', async () => {
		const { claims, versionId, database, client, transactionRunner } = setup();
		let completed = false;
		await claims
			.withClaim(versionId, async (claim) => {
				const [row] = await database.execute(sql`select pg_backend_pid() as pid`);
				await client`select pg_terminate_backend(${Number(row?.pid)})`;
				await transactionRunner.run(async () => {
					await claim.assertOwned();
					completed = true;
				});
			})
			.then(
				() => {
					throw new Error('Expected lost connection');
				},
				() => undefined
			);
		expect(completed).toBe(false);
	});
	it('releases ownership so another worker can resume the version', async () => {
		const { claims, versionId } = setup();
		await claims.withClaim(versionId, async () => {});
		expect(
			await claims.withClaim(versionId, async (claim) => {
				await claim.assertOwned();
				return 'resumed';
			})
		).toEqual({ kind: 'claimed', value: 'resumed' });
	});
});

import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { MemoryLibrary } from '$lib/server/services/memory/library';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import {
	memoryEntryBuilder,
	testMemoryEntryId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { context, seedNote } from '../database-harness';

it('deletes the latest memory version after a concurrent edit commits', async () => {
	const { owner, project } = await seedNote('22401');
	const records = new MemoryRecords(context.db);
	const entry = await records.insert(
		owner,
		memoryEntryBuilder({
			id: testMemoryEntryId(22401),
			userId: owner.userId,
			projectId: project.id,
			content: 'Original content',
			shareWithAgents: true
		})
	);
	const connection = connectPostgresTestDatabase(context.url);
	const { database, transactionRunner } = createTransactionContext(connection.db);
	const memory = new MemoryLibrary(
		new MemoryRecords(database),
		new ProjectRecords(database),
		new ProvenanceRecords(database)
	);
	const blocker = postgres(context.url, { max: 2 });
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const editing = blocker.begin(async (transaction) => {
		await transaction`select id from memory_entries where id = ${entry.id} for update`;
		locked.resolve();
		await release.promise;
		await transaction`update memory_entries set content = 'Latest content', share_with_agents = false where id = ${entry.id}`;
	});
	try {
		await locked.promise;
		const [backend] = await connection.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const removing = transactionRunner.run(() => memory.remove(owner, entry.id));
		await vi.waitFor(async () => {
			const waiting = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (waiting.length !== 1) throw new Error('Memory deletion has not reached the locked row');
		});
		release.resolve();
		await editing;
		await removing;
		const stored = await records.findById(owner, entry.id);
		expect({
			content: stored?.content,
			shared: stored?.shareWithAgents,
			deleted: stored?.deletedAt !== undefined
		}).toEqual({ content: 'Latest content', shared: false, deleted: true });
	} finally {
		release.resolve();
		await editing;
		await Promise.all([connection.close(), blocker.end()]);
	}
});

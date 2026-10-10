import { sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { initialSyncCursor, syncEtag, type SyncPage } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { workspacePullFixture } from '$lib/testing/workspace/fixtures/sync-pull';
import { context, seedNote } from '../database-harness';

it('retains the selected body and version when a writer commits before the body read', async () => {
	const { owner, note } = await seedNote('8840');
	const reader = connectPostgresTestDatabase(context.url);
	const writer = connectPostgresTestDatabase(context.url);
	const workspace = workspacePullFixture(reader.db);
	let pulling: Promise<SyncPage<WorkspaceRecord>> | undefined;
	try {
		const initial = await workspace.pullChangePage(owner, initialSyncCursor);
		await context.client`update notes set title = 'Selected body' where id = ${note.id}`;
		const selected = await workspace.pullChangePage(owner, initial.cursor);
		const [version] = await context.client<{ version: string }[]>`
			select version::text from workspace_sync_versions where resource_type = 'notes'
			and resource_id = jsonb_build_array(${note.id}::text)`;
		if (!version) throw new Error('The selected note has no version');
		const [backend] = await reader.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		if (!backend) throw new Error('The reader has no backend');
		await writer.client`begin`;
		await writer.client`lock table notes in access exclusive mode`;
		await writer.client`update notes set title = 'Committed during pull' where id = ${note.id}`;
		pulling = workspace.pullChangePage(owner, initial.cursor);
		// Journal selection does not lock notes. This wait proves the pull has reached its body read.
		await vi.waitFor(
			async () => {
				const waiting = await context.client<{ pid: number }[]>`
				select pid from pg_locks where pid = ${backend.pid} and relation = 'notes'::regclass
				and mode = 'AccessShareLock' and not granted`;
				if (waiting.length !== 1)
					throw new Error('The pull must wait at the selected resource read');
			},
			{ timeout: 5000 }
		);
		await writer.client`commit`;
		const during = await pulling;
		const after = await workspace.pullChangePage(owner, during.cursor);
		expect({ during, after }).toEqual({
			during: selected,
			after: {
				cursor: String(BigInt(selected.cursor) + 1n),
				hasMore: false,
				records: [
					{
						key: `["notes","${note.id}"]`,
						resource: {
							kind: 'found',
							snapshot: {
								etag: syncEtag(BigInt(version.version) + 1n),
								value: {
									type: 'notes',
									value: expect.objectContaining({ id: note.id, title: 'Committed during pull' })
								}
							}
						}
					}
				]
			}
		});
	} finally {
		await writer.client`rollback`;
		if (pulling) await Promise.allSettled([pulling]);
		await Promise.all([reader.close(), writer.close()]);
	}
});

it('opens a readonly repeatable-read transaction on the contextual database', async () => {
	const { database, transactionRunner } = createTransactionContext(context.db);
	const settings = await transactionRunner.run(
		() =>
			database.execute(sql`
		select current_setting('transaction_isolation') as isolation,
		current_setting('transaction_read_only') as readonly
	`),
		{ retry: 'never', mode: 'read-only-snapshot' }
	);
	expect(Array.from(settings)).toEqual([{ isolation: 'repeatable read', readonly: 'on' }]);
});

it('rejects writes inside the snapshot transaction', async () => {
	const { note } = await seedNote('8841');
	const { database, transactionRunner } = createTransactionContext(context.db);
	const result = await transactionRunner
		.run(
			() =>
				database.execute(sql`
		update notes set title = 'Forbidden' where id = ${note.id}
	`),
			{ retry: 'never', mode: 'read-only-snapshot' }
		)
		.catch((error: Error) => ({ kind: 'failure', error }));
	const saved = await context.client`select title from notes where id = ${note.id}`;
	expect({ result, saved }).toEqual({
		result: {
			kind: 'failure',
			error: expect.objectContaining({ cause: expect.objectContaining({ code: '25006' }) })
		},
		saved: [{ title: note.title }]
	});
});

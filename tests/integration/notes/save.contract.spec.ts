import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { DomainError } from '$lib/errors';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { saveNoteDraft } from '$lib/testing/notes/fixtures/saved-draft';
import { context, seedNote } from '../database-harness';

it.each([
	{ change: 'archive', code: 'VALIDATION', suffix: '18301' },
	{ change: 'edit', code: 'STALE_REVISION', suffix: '18302' }
])(
	'validates an unchanged save after a concurrent $change commits',
	async ({ change, code, suffix }) => {
		const { owner, note } = await seedNote(suffix);
		const writer = connectPostgresTestDatabase(context.url);
		const blocker = postgres(context.url, { max: 2 });
		const { database, transactionRunner } = createTransactionContext(writer.db);
		const { catalog } = createNotesCapability({
			db: database,
			projects: new ProjectRecords(database)
		});
		const locked = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const peer = blocker.begin(async (transaction) => {
			if (change === 'archive')
				await transaction`update notes set archived_at = now() where id = ${note.id}`;
			else
				await transaction`update notes set title = 'Peer title', current_revision = current_revision + 1 where id = ${note.id}`;
			locked.resolve();
			await release.promise;
		});
		try {
			await locked.promise;
			const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
			const saving = saveNoteDraft(catalog, transactionRunner, owner, note).then(
				() => ({ kind: 'saved' }),
				(error) => {
					if (!(error instanceof DomainError)) throw error;
					return { kind: 'failure', code: error.code };
				}
			);
			await vi.waitFor(async () => {
				const waiting = await blocker<
					{ pid: number }[]
				>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
				if (waiting.length !== 1) throw new Error('Save has not reached the locked note');
			});
			release.resolve();
			await peer;
			expect(await saving).toEqual({ kind: 'failure', code });
		} finally {
			release.resolve();
			await peer;
			await Promise.all([writer.close(), blocker.end()]);
		}
	}
);

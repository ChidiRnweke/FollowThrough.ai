import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { context, replaceNoteFixture, seedNote } from '../database-harness';
import { skillController } from './edit-harness';

it('checks a skill sync base after a competing note rename without reversing the row locks', async () => {
	const seeded = await seedNote('20210');
	const { owner } = seeded;
	const note = await replaceNoteFixture({ ...seeded.note, kind: 'skill' });
	await new SkillRecords(context.db).insert(owner, {
		note,
		slug: 'release-guide',
		description: 'Initial description',
		triggerHints: [],
		metadata: {},
		allowImplicitInvocation: true,
		isEnabled: true
	});
	const before = await createSyncCapability({ db: context.db }).objects.read(
		owner,
		{ type: 'skills', id: [note.id] },
		null
	);
	if (before.kind !== 'found') throw new Error('The seeded skill is missing');
	const editor = postgres(context.url, { max: 1 });
	const writer = connectPostgresTestDatabase(context.url);
	const observer = postgres(context.url, { max: 1 });
	const tx = createTransactionContext(writer.db);
	const ready = Promise.withResolvers<void>();
	const rename = Promise.withResolvers<void>();
	const editing = editor
		.begin(async (transaction) => {
			await transaction`select id from notes where id = ${note.id} for update`;
			ready.resolve();
			await rename.promise;
			await transaction`update notes set title = 'Renamed guide' where id = ${note.id}`;
		})
		.then(
			() => ({ kind: 'success' as const }),
			(error: Error) => {
				ready.reject(error);
				return { kind: 'failure' as const, error };
			}
		);
	try {
		await ready.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const writing = skillController(tx.database, tx.transactionRunner).synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: before.snapshot.etag,
			command: { kind: 'updateSkill', noteId: note.id, description: 'Offline description' }
		});
		await vi.waitFor(async () => {
			const rows = await observer<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (rows.length !== 1) throw new Error('The synchronized edit has not reached its row lock');
		});
		rename.resolve();
		const result = await writing;
		expect({
			rename: await editing,
			result: result.kind,
			skill: await new SkillRecords(context.db).findByNoteId(owner, note.id)
		}).toMatchObject({
			rename: { kind: 'success' },
			result: 'conflict',
			skill: { note: { title: 'Renamed guide' }, description: 'Initial description' }
		});
	} finally {
		rename.resolve();
		await editing;
		await Promise.all([editor.end(), writer.close(), observer.end()]);
	}
});

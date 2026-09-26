import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { DomainError } from '$lib/errors';
import { noteEtag } from '$lib/services/notes/presentation';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { replaceNoteFixture, context, seedNote } from '../database-harness';

it('rolls back the snapshot when PostgreSQL rejects publication', async () => {
	const seeded = await seedNote('18503');
	const { owner } = seeded;
	const records = new NoteRecords(context.db);
	const note = await replaceNoteFixture({
		...seeded.note,
		title: 'Publication rollback contract'
	});
	const { database, transactionRunner } = createTransactionContext(context.db);
	const { catalog } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			transactionRunner,
			notePublisher: catalog,
			revisionRecorder: catalog
		})
	);
	await context.client`create function reject_contract_note_publication() returns trigger language plpgsql as $$
	begin
		if new.title = 'Publication rollback contract' and new.published_revision <> old.published_revision then
			raise exception 'Publication storage failed';
		end if;
		return new;
	end $$`;
	await context.client`create trigger reject_contract_note_publication before update on notes for each row execute function reject_contract_note_publication()`;
	try {
		await controller
			.publish(owner, { noteId: note.id, baseEtag: noteEtag(note) })
			.catch(() => ({ kind: 'failure' }));
		expect({
			note: await records.findById(owner, note.id),
			snapshots: await records.listRevisions(owner, note.id)
		}).toEqual({ note, snapshots: [] });
	} finally {
		await context.client`drop trigger reject_contract_note_publication on notes`;
		await context.client`drop function reject_contract_note_publication()`;
	}
});

it.each([
	{ change: 'archive', suffix: '18501', code: 'VALIDATION' },
	{ change: 'edit', suffix: '18502', code: 'STALE_REVISION' }
])(
	'refuses publication after a concurrent $change without replacing the note',
	async ({ change, suffix, code }) => {
		const { owner, note } = await seedNote(suffix);
		const writer = connectPostgresTestDatabase(context.url);
		const blocker = postgres(context.url, { max: 2 });
		const { database, transactionRunner } = createTransactionContext(writer.db);
		const { catalog } = createNotesCapability({
			db: database,
			projects: new ProjectRecords(database)
		});
		const controller = new Notes(
			capabilityDependencies<NotesDependencies>({
				transactionRunner,
				notePublisher: catalog,
				revisionRecorder: catalog
			})
		);
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
			const publishing = controller
				.publish(owner, { noteId: note.id, baseEtag: noteEtag(note) })
				.then(
					() => ({ kind: 'published' }),
					(error) => {
						if (!(error instanceof DomainError)) throw error;
						return { kind: 'failure', code: error.code };
					}
				);
			await vi.waitFor(async () => {
				const waiting = await blocker<
					{ pid: number }[]
				>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
				if (waiting.length !== 1) throw new Error('Publication has not reached the locked note');
			});
			release.resolve();
			await peer;
			const result = await publishing;
			const records = new NoteRecords(context.db);
			const saved = await records.findById(owner, note.id);
			expect({
				result,
				title: saved?.title,
				revision: saved?.currentRevision,
				published: saved?.publishedRevision,
				archived: Boolean(saved?.archivedAt),
				snapshots: await records.listRevisions(owner, note.id)
			}).toEqual({
				result: { kind: 'failure', code },
				title: change === 'edit' ? 'Peer title' : note.title,
				revision: change === 'edit' ? note.currentRevision + 1 : note.currentRevision,
				published: note.publishedRevision,
				archived: change === 'archive',
				snapshots: []
			});
		} finally {
			release.resolve();
			await peer;
			await Promise.all([writer.close(), blocker.end()]);
		}
	}
);

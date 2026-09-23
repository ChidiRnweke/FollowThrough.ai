import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { NoteId } from '$lib/models/notes';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { replaceNoteFixture, actor, context, seedNote } from '../database-harness';

it('restores to the root after a concurrent parent archive commits', async () => {
	const { owner, note } = await seedNote('16405');
	const records = new NoteRecords(context.db);
	const parent = await records.insert(owner, {
		...note,
		id: crypto.randomUUID() as NoteId,
		kind: 'folder',
		title: 'Parent',
		document: { type: 'doc', content: [] },
		plainText: ''
	});
	await replaceNoteFixture({ ...note, parentId: parent.id, archivedAt: note.updatedAt });
	const writer = connectPostgresTestDatabase(context.url);
	const blocker = postgres(context.url, { max: 2 });
	const { database, transactionRunner } = createTransactionContext(writer.db);
	const { catalog } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			noteTrash: catalog,
			noteIndexer: new InMemoryNoteContent(),
			transactionRunner
		})
	);
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const archiving = blocker.begin(async (transaction) => {
		await transaction`update notes set archived_at = now() where id = ${parent.id}`;
		locked.resolve();
		await release.promise;
	});
	try {
		await locked.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const restoring = controller.restore(owner, { noteId: note.id });
		await vi.waitFor(async () => {
			const waiting = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (waiting.length !== 1) throw new Error('Restore has not reached the locked parent');
		});
		release.resolve();
		await archiving;
		await restoring;
		expect(await records.findById(owner, note.id)).toMatchObject({
			parentId: undefined,
			archivedAt: undefined,
			position: 1
		});
	} finally {
		release.resolve();
		await archiving;
		await Promise.all([writer.close(), blocker.end()]);
	}
});

it('archives the authoritative note after a concurrent note edit commits', async () => {
	const { owner, note } = await seedNote('16401');
	const writer = connectPostgresTestDatabase(context.url);
	const blocker = postgres(context.url, { max: 2 });
	const { database, transactionRunner } = createTransactionContext(writer.db);
	const { catalog } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			noteTrash: catalog,
			noteIndexer: new InMemoryNoteContent(),
			transactionRunner
		})
	);
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const editing = blocker.begin(async (transaction) => {
		await transaction`update notes set title = 'Concurrent title', current_revision = current_revision + 1 where id = ${note.id}`;
		locked.resolve();
		await release.promise;
	});
	try {
		await locked.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const archiving = controller.archive(owner, { noteId: note.id });
		await vi.waitFor(async () => {
			const waiting = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (waiting.length !== 1) throw new Error('Archive has not reached the locked note');
		});
		release.resolve();
		await editing;
		const result = await archiving;
		const stored = await new NoteRecords(context.db).findById(owner, note.id);
		expect({
			title: stored?.title,
			revision: stored?.currentRevision,
			archived: Boolean(stored?.archivedAt),
			returned: result.note
		}).toEqual({
			title: 'Concurrent title',
			revision: note.currentRevision + 1,
			archived: true,
			returned: stored
		});
	} finally {
		release.resolve();
		await editing;
		await Promise.all([writer.close(), blocker.end()]);
	}
});

it('does not expose another actor’s note through a locking read', async () => {
	const { note } = await seedNote('16402');
	const { database, transactionRunner } = createTransactionContext(context.db);
	expect(
		await transactionRunner.run(() =>
			new NoteRecords(database).findForWrite(actor('16403'), note.id)
		)
	).toBeUndefined();
});

it('does not expose notes in an archived project through a locking read', async () => {
	const { owner, note, project } = await seedNote('16404');
	await new ProjectRecords(context.db).archive(owner, project.id);
	const { database, transactionRunner } = createTransactionContext(context.db);
	expect(
		await transactionRunner.run(() => new NoteRecords(database).findForWrite(owner, note.id))
	).toBeUndefined();
});

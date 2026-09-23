import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { Database } from '$lib/server/db';
import type { NoteId } from '$lib/models/notes';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { context, seedNote } from '../database-harness';

const controllers = (database: Database, transactionRunner: TransactionRunner) => {
	const projects = new ProjectRecords(database);
	const catalog = new ProjectCatalog(projects, projects);
	const notes = new NoteCatalog(
		new NoteRecords(database),
		new SourceAnchorRecords(database),
		projects
	);
	return {
		projects: new Projects(
			capabilityDependencies<ProjectsDependencies>({
				entryWriter: catalog,
				projectEditor: catalog,
				noteCreation: notes,
				transactionRunner
			})
		),
		notes: new Notes(
			capabilityDependencies<NotesDependencies>({
				noteCreation: notes,
				noteTrash: notes,
				noteIndexer: new InMemoryNoteContent(),
				transactionRunner
			})
		)
	};
};

/** Hold an actual controller write open until the competing connection reaches its lock. */
const competingWrites = async <T>(
	first: (api: ReturnType<typeof controllers>) => Promise<void>,
	second: (api: ReturnType<typeof controllers>) => Promise<T>
) => {
	const holder = connectPostgresTestDatabase(context.url);
	const writer = connectPostgresTestDatabase(context.url);
	const observer = postgres(context.url, { max: 1 });
	const heldContext = createTransactionContext(holder.db);
	const writeContext = createTransactionContext(writer.db);
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const holding = heldContext.transactionRunner.run(async () => {
		await first(controllers(heldContext.database, heldContext.transactionRunner));
		locked.resolve();
		await release.promise;
	});
	// A setup failure must reject the readiness gate instead of leaving the test waiting.
	void holding.catch((error) => {
		locked.reject(error);
		return { kind: 'failure', error };
	});
	try {
		await locked.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const writing = second(controllers(writeContext.database, writeContext.transactionRunner)).then(
			(value) => ({ kind: 'success' as const, value }),
			(error: Error) => ({ kind: 'failure' as const, error })
		);
		await vi.waitFor(async () => {
			const rows = await observer<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (rows.length !== 1) throw new Error('The competing tree write has not reached its lock');
		});
		release.resolve();
		await holding;
		return await writing;
	} finally {
		release.resolve();
		try {
			await holding;
		} finally {
			await Promise.all([holder.close(), writer.close(), observer.end()]);
		}
	}
};

it('refuses creation into a folder after a concurrent archive commits', async () => {
	const { owner, note, project } = await seedNote('19301');
	await new NoteRecords(context.db).update(owner, { ...note, kind: 'folder' });
	const result = await competingWrites(
		async (api) => {
			await api.notes.archive(owner, { noteId: note.id });
		},
		(api) => api.notes.create(owner, { projectId: project.id, parentId: note.id, title: 'Child' })
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'VALIDATION' } });
});

it('refuses archiving a folder after concurrent child creation commits', async () => {
	const { owner, note, project } = await seedNote('19302');
	await new NoteRecords(context.db).update(owner, { ...note, kind: 'folder' });
	const result = await competingWrites(
		async (api) => {
			await api.projects.createFolder(owner, {
				projectId: project.id,
				parentId: note.id,
				name: 'Child folder'
			});
		},
		(api) => api.notes.archive(owner, { noteId: note.id })
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'VALIDATION' } });
});

it('refuses the second of two moves that would create a folder cycle', async () => {
	const { owner, note, project } = await seedNote('19303');
	const records = new NoteRecords(context.db);
	await records.update(owner, { ...note, kind: 'folder' });
	const peer = await records.insert(owner, {
		...note,
		id: crypto.randomUUID() as NoteId,
		kind: 'folder',
		title: 'Peer',
		position: 1
	});
	const result = await competingWrites(
		async (api) => {
			await api.projects.move(owner, {
				projectId: project.id,
				entryId: note.id,
				parentId: peer.id,
				position: 0
			});
		},
		(api) =>
			api.projects.move(owner, {
				projectId: project.id,
				entryId: peer.id,
				parentId: note.id,
				position: 0
			})
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'VALIDATION' } });
});

it('assigns a later sibling position after concurrent creation commits', async () => {
	const { owner, project } = await seedNote('19304');
	const result = await competingWrites(
		async (api) => {
			await api.notes.create(owner, { projectId: project.id, title: 'First new sibling' });
		},
		(api) => api.projects.createFolder(owner, { projectId: project.id, name: 'Second new sibling' })
	);
	expect(result).toMatchObject({ kind: 'success', value: { folder: { position: 2 } } });
});

it('refuses creation after a concurrent project archive commits', async () => {
	const { owner, project } = await seedNote('19305');
	const result = await competingWrites(
		async (api) => {
			await api.projects.archive(owner, { projectId: project.id });
		},
		(api) => api.notes.create(owner, { projectId: project.id, title: 'Too late' })
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'NOT_FOUND' } });
});

it('refuses moving into a folder after a concurrent archive commits', async () => {
	const { owner, note, project } = await seedNote('19306');
	const parent = await new NoteRecords(context.db).insert(owner, {
		...note,
		id: crypto.randomUUID() as NoteId,
		kind: 'folder',
		title: 'Destination',
		position: 1
	});
	const result = await competingWrites(
		async (api) => {
			await api.notes.archive(owner, { noteId: parent.id });
		},
		(api) =>
			api.projects.move(owner, {
				projectId: project.id,
				entryId: note.id,
				parentId: parent.id,
				position: 0
			})
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'NOT_FOUND' } });
});

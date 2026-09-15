import { describe, expect, it } from 'vitest';
import type { TodoId } from '$lib/models/todos';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createTodosCapability } from '$lib/server/factories/capabilities/todos-capability-factory';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const sync = createSyncCapability({ db: database, transactionRunner });
	const projects = new ProjectRecords(database);
	const notes = createNotesCapability({ db: database, projects });
	const { catalog } = createTodosCapability({
		db: database,
		projects,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	const controller = new Todos(
		capabilityDependencies<TodosDependencies>({
			syncMutations: sync.mutations,
			todoCreator: catalog,
			todoReader: catalog,
			todoEditor: catalog,
			todoStatusChanger: catalog,
			todoViewAssembler: catalog,
			todoDeleter: catalog
		})
	);
	return { ...seeded, controller, sync };
};

describe('offline todo writes through the versioned boundary', () => {
	it('preserves a client-created identity and its requested board column across retries', async () => {
		const { owner, project, controller } = await setup('9251');
		const id = crypto.randomUUID() as TodoId;
		const input = {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command: {
				kind: 'createTodo' as const,
				id,
				projectId: project.id,
				title: 'Offline task',
				responsibility: 'mine' as const,
				status: 'backlog' as const
			}
		};
		await controller.synchronize(owner, input);
		await controller.synchronize(owner, input);
		expect(await context.client`select id, status from todos where id = ${id}`).toEqual([
			{ id, status: 'backlog' }
		]);
	});
	it('preserves another client edit when an offline task update has an older base', async () => {
		const { owner, project, controller, sync } = await setup('9252');
		const { todo } = await controller.create(owner, {
			projectId: project.id,
			title: 'Original',
			responsibility: 'mine'
		});
		const base = await sync.objects.read(owner, { type: 'todos', id: [todo.id] }, null);
		if (base.kind !== 'found') throw new Error('Expected the created task');
		await controller.update(owner, { todoId: todo.id, title: 'Other client' });
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: base.snapshot.etag,
			command: { kind: 'updateTodo', todoId: todo.id, title: 'Offline text' }
		});
		expect({
			kind: result.kind,
			title: (await controller.get(owner, { todoId: todo.id })).todo.title
		}).toEqual({ kind: 'conflict', title: 'Other client' });
	});
});

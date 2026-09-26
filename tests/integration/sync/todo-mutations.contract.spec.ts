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
	const sync = createSyncCapability({ db: database });
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
			syncRetry: sync.mutationRetry,
			transactionRunner,
			todoCreator: catalog,
			todoReader: catalog,
			todoEditor: catalog,
			todoContextReader: catalog,
			todoDeleter: catalog
		})
	);
	return { ...seeded, controller, sync };
};

describe('offline todo writes through the versioned boundary', () => {
	it('persists explicit clears for nullable task fields', async () => {
		const { owner, project, note, controller } = await setup('9256');
		const { todo } = await controller.create(owner, {
			projectId: project.id,
			title: 'Original',
			description: 'Context',
			dueDate: '2026-09-20' as never,
			responsibility: 'waiting_on',
			waitingOn: 'Sam'
		});
		await controller.update(owner, {
			todoId: todo.id,
			linkedNoteId: note.id,
			priority: 'high',
			category: 'Client'
		});
		await controller.update(owner, {
			todoId: todo.id,
			description: null,
			dueDate: null,
			waitingOn: null,
			linkedNoteId: null,
			priority: null,
			category: null
		});
		const stored = (await controller.get(owner, { todoId: todo.id })).todo;
		expect([
			stored.description,
			stored.dueDate,
			stored.waitingOn,
			stored.linkedNoteId,
			stored.priority,
			stored.category
		]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
	});
	it('persists a combined task edit with its completion time and cleared counterparty', async () => {
		const { owner, project, controller } = await setup('9253');
		const { todo } = await controller.create(owner, {
			projectId: project.id,
			title: 'Original',
			responsibility: 'waiting_on',
			waitingOn: 'Sam'
		});
		const result = await controller.update(owner, {
			todoId: todo.id,
			title: 'Finished',
			status: 'done',
			responsibility: 'mine'
		});
		const stored = (await controller.get(owner, { todoId: todo.id })).todo;
		expect({
			title: stored.title,
			status: stored.status,
			waitingOn: stored.waitingOn,
			completedAt: stored.completedAt,
			updatedAt: stored.updatedAt
		}).toEqual({
			title: 'Finished',
			status: 'done',
			waitingOn: undefined,
			completedAt: result.todo.updatedAt,
			updatedAt: result.todo.updatedAt
		});
	});
	it('rejects an invalid linked note without persisting the other fields', async () => {
		const { owner, project, controller } = await setup('9254');
		const other = await seedNote('9255', owner);
		const { todo } = await controller.create(owner, {
			projectId: project.id,
			title: 'Original',
			responsibility: 'mine'
		});
		const result = await controller
			.update(owner, {
				todoId: todo.id,
				title: 'Changed',
				status: 'done',
				linkedNoteId: other.note.id
			})
			.then(
				() => 'saved',
				(error: Error) => error.message
			);
		expect({ result, stored: (await controller.get(owner, { todoId: todo.id })).todo }).toEqual({
			result: 'Todo linked note was not found',
			stored: todo
		});
	});
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

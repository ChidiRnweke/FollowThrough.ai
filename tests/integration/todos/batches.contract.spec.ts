import { describe, expect, it } from 'vitest';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createTodosCapability } from '$lib/server/factories/capabilities/todos-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { createTodoBatchSchema } from '$lib/models/todos';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const projects = new ProjectRecords(database);
	const notes = createNotesCapability({ db: database, projects });
	const capability = createTodosCapability({
		db: database,
		projects,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	const controller = new Todos(
		capabilityDependencies<TodosDependencies>({
			todoCreator: capability.catalog,
			todoEditor: capability.catalog,
			todoContextReader: capability.catalog,
			todoBatchReceipts: capability.batchReceipts,
			transactionRunner
		})
	);
	const input = createTodoBatchSchema.parse({
		requestId: crypto.randomUUID(),
		projectId: seeded.project.id,
		todos: [
			{ title: 'First task', responsibility: 'mine' },
			{ title: 'Second task', responsibility: 'mine' }
		]
	});
	return { ...seeded, controller, input };
};

describe('durable task batch transactions', () => {
	it('fails on an unreadable saved outcome without creating replacement tasks', async () => {
		const { owner, project, controller, input } = await setup('9268');
		const original = await controller.createBatch(owner, input);
		await context.client`update todo_batch_receipts set result = '{"todos":[{"id":"invalid"}]}'::jsonb where user_id = ${owner.userId} and request_id = ${input.requestId}`;
		const outcome = await controller.createBatch(owner, input).then(
			() => 'saved',
			() => 'rejected'
		);
		const ids =
			await context.client`select id from todos where project_id = ${project.id} order by title`;
		expect({ outcome, ids }).toEqual({
			outcome: 'rejected',
			ids: original.todos.map((todo) => ({ id: todo.id }))
		});
	});
	it('rolls back earlier tasks when the database rejects a later task', async () => {
		const { owner, project, controller, input } = await setup('9261');
		await context.client`alter table todos add constraint batch_failure_test check (title <> 'Reject this batch task')`;
		try {
			const outcome = await controller
				.createBatch(owner, {
					...input,
					todos: [input.todos[0]!, { title: 'Reject this batch task', responsibility: 'mine' }]
				})
				.then(
					() => 'saved',
					() => 'rejected'
				);
			const tasks = await context.client`select id from todos where project_id = ${project.id}`;
			const receipts =
				await context.client`select request_id from todo_batch_receipts where user_id = ${owner.userId}`;
			expect({ outcome, tasks, receipts }).toEqual({
				outcome: 'rejected',
				tasks: [],
				receipts: []
			});
		} finally {
			await context.client`alter table todos drop constraint batch_failure_test`;
		}
	});
	it('returns one saved batch to concurrent duplicate deliveries', async () => {
		const { owner, project, controller, input } = await setup('9262');
		const [first, second] = await Promise.all([
			controller.createBatch(owner, input),
			controller.createBatch(owner, input)
		]);
		const ids =
			await context.client`select id from todos where project_id = ${project.id} order by title`;
		expect({ second, ids }).toEqual({
			second: first,
			ids: first!.todos.map((todo) => ({ id: todo.id }))
		});
	});
	it('returns the original outcome after tasks are edited and the original response is lost', async () => {
		const { owner, controller, input } = await setup('9263');
		const first = await controller.createBatch(owner, input);
		await controller.update(owner, { todoId: first.todos[0]!.id, title: 'Later edit' });
		expect(await controller.createBatch(owner, input)).toEqual(first);
	});
	it('rejects a different batch under an existing request ID', async () => {
		const { owner, controller, input } = await setup('9264');
		await controller.createBatch(owner, input);
		await expect(
			controller.createBatch(owner, {
				...input,
				todos: [{ title: 'Changed request', responsibility: 'mine' }]
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('isolates the same request ID between accounts', async () => {
		const first = await setup('9265');
		const second = await setup('9266');
		await first.controller.createBatch(first.owner, first.input);
		const result = await second.controller.createBatch(second.owner, {
			...second.input,
			requestId: first.input.requestId
		});
		expect(result.todos.map((todo) => todo.userId)).toEqual([
			second.owner.userId,
			second.owner.userId
		]);
	});
	it('compares request content without depending on object key order', async () => {
		const { owner, controller, input } = await setup('9267');
		const first = await controller.createBatch(owner, input);
		const retry = {
			todos: input.todos.map(({ title, responsibility }) => ({ responsibility, title })),
			projectId: input.projectId,
			requestId: input.requestId
		};
		expect(await controller.createBatch(owner, retry)).toEqual(first);
	});
});

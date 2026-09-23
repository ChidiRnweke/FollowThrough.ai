import { todoWrite } from '$lib/controllers/workspace/commands';
import type { UpdateTodoInput } from '$lib/models/todos';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { describe, expect, it } from 'vitest';
import { Todos, type TodosDependencies } from './controller';
import { TodoCatalog } from '$lib/server/services/todos/catalog';
import { InMemoryTodoRepository } from '$lib/testing/todos/fakes/in-memory-todo-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	testActor,
	testNow,
	testTodoId,
	testNoteId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const records = new InMemoryTodoRepository();
	const original = todoBuilder({
		title: 'Original',
		description: 'Keep context',
		responsibility: 'waiting_on',
		waitingOn: 'Sam'
	});
	records.todos = [original];
	const catalog = new TodoCatalog(
		records,
		new InMemoryProjectRepository(),
		new InMemoryAnchorRepository(),
		new InMemoryNoteRepository(),
		new InMemoryProvenanceRepository(),
		() => testNow
	);
	const controller = new Todos(
		capabilityDependencies<TodosDependencies>({
			todoEditor: catalog,
			todoContextReader: catalog,
			transactionRunner: new InMemoryTransactionRunner([records])
		}),
		() => testNow
	);
	return { records, original, controller };
};

describe('complete task edits', () => {
	const edits: readonly Omit<UpdateTodoInput, 'todoId'>[] = [
		{ title: '  Retitled  ', status: 'done' },
		{ responsibility: 'mine', waitingOn: 'Sam' },
		{
			description: null,
			dueDate: null,
			priority: null,
			category: null,
			waitingOn: null,
			linkedNoteId: null
		}
	];
	it.each(edits)('matches the offline task preview for %j', async (edit) => {
		const { controller, original } = setup();
		const { todo } = await controller.update(testActor(), { todoId: original.id, ...edit });
		expect(todo).toEqual(todoWrite(original, edit, testNow).local?.value);
	});

	it('leaves all fields unchanged when saving the completed task fails', async () => {
		const { controller, records, original } = setup();
		records.updateFailures.set('done', new Error('Completion write failed'));
		const result = await controller
			.update(testActor(), { todoId: testTodoId(), title: 'Changed', status: 'done' })
			.then(
				() => 'saved',
				(error: Error) => error.message
			);
		expect({ result, stored: records.todos }).toEqual({
			result: 'Completion write failed',
			stored: [original]
		});
	});
	it('stores fields and completion together with one resolved timestamp', async () => {
		const { controller, records } = setup();
		const result = await controller.update(testActor(), {
			todoId: testTodoId(),
			title: '  Finished  ',
			status: 'done',
			responsibility: 'mine'
		});
		expect({ returned: result.todo, stored: records.todos[0], view: result.view.todo }).toEqual({
			returned: expect.objectContaining({
				title: 'Finished',
				status: 'done',
				completedAt: testNow,
				updatedAt: testNow,
				description: 'Keep context',
				waitingOn: undefined
			}),
			stored: result.todo,
			view: result.todo
		});
	});
	it('rejects an unavailable linked note before saving any other edit', async () => {
		const { controller, records, original } = setup();
		const result = await controller
			.update(testActor(), {
				todoId: testTodoId(),
				title: 'Changed',
				status: 'done',
				linkedNoteId: testNoteId()
			})
			.then(
				() => 'saved',
				(error: Error) => error.message
			);
		expect({ result, stored: records.todos }).toEqual({
			result: 'Todo linked note was not found',
			stored: [original]
		});
	});
	it('preserves completion time when editing an already completed task', async () => {
		const { controller, records, original } = setup();
		const completedAt = '2026-01-01T00:00:00.000Z' as typeof testNow;
		records.todos = [{ ...original, status: 'done', completedAt }];
		const result = await controller.update(testActor(), {
			todoId: testTodoId(),
			title: 'Retitled',
			status: 'done'
		});
		expect(result.todo.completedAt).toBe(completedAt);
	});
});

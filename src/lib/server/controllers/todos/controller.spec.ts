import { TodoBoardExportService } from '$lib/services/todos/board-export';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	testActor,
	testTodoId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Todos, type TodosDependencies } from './controller';

const setup = () => {
	const todos = new InMemoryTodos();
	return {
		todos,
		controller: new Todos(
			new WorkspaceCommandRulesService(),
			capabilityDependencies<TodosDependencies>({
				...agentToolResultsFixture(),
				boardExport: new TodoBoardExportService(),
				todoPresentation: new TodoPresentationService(),
				todoEditingRules: new TodoEditingRulesService(),
				todoCreationRules: new TodoEditingRulesService(),
				todoLister: todos,
				todoContextReader: todos,
				todoReader: todos,
				todoEditor: todos,
				transactionRunner: new InMemoryTransactionRunner([todos]),
				todoDeleter: todos
			})
		)
	};
};

describe('Todo edit invariants', () => {
	it('rejects an update without an edit', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder()];
		await expect(controller.update(testActor(), { todoId: testTodoId() })).rejects.toMatchObject({
			code: 'INVALID_GENERATED_CONTENT'
		});
	});

	it('clears a due date when explicitly set to null', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder({ dueDate: '2026-07-20' as never })];
		const result = await controller.update(testActor(), { todoId: testTodoId(), dueDate: null });
		expect(result.todo.dueDate).toBeUndefined();
	});

	it('clears a description when explicitly set to null', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder({ description: 'Context' })];
		const result = await controller.update(testActor(), {
			todoId: testTodoId(),
			description: null
		});
		expect(result.todo.description).toBeUndefined();
	});

	it('trims and stores a category', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder()];
		const result = await controller.update(testActor(), {
			todoId: testTodoId(),
			category: '  Client work  '
		});
		expect(result.todo.category).toBe('Client work');
	});

	it('clears a category when explicitly set to null or blank (1/2)', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder({ category: 'Client work' }), todoBuilder({ id: testTodoId(2) })];
		const cleared = await controller.update(testActor(), {
			todoId: testTodoId(),
			category: null
		});
		expect(cleared.todo.category).toBeUndefined();
		const _blanked = await controller.update(testActor(), {
			todoId: testTodoId(2),
			category: '   '
		});
	});

	it('clears a category when explicitly set to null or blank (2/2)', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder({ category: 'Client work' }), todoBuilder({ id: testTodoId(2) })];
		const _cleared = await controller.update(testActor(), {
			todoId: testTodoId(),
			category: null
		});
		const blanked = await controller.update(testActor(), {
			todoId: testTodoId(2),
			category: '   '
		});
		expect(blanked.todo.category).toBeUndefined();
	});

	it('a partial title edit preserves the description', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder({ description: 'Keep this context' })];
		const result = await controller.update(testActor(), {
			todoId: testTodoId(),
			title: 'Updated title'
		});
		expect(result.todo.description).toBe('Keep this context');
	});

	it('trims an edited title', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder()];
		const result = await controller.update(testActor(), {
			todoId: testTodoId(),
			title: '  Updated title  '
		});
		expect(result.todo.title).toBe('Updated title');
	});

	it('rejects a whitespace-only title', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder()];
		await expect(
			controller.update(testActor(), { todoId: testTodoId(), title: '   ' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('does not reveal another user’s todo during update', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder()];
		await expect(
			controller.update(testActor(2), { todoId: testTodoId(), title: 'Foreign edit' })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});

describe('Todo removal invariants', () => {
	it('a removed todo no longer appears in the active list', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder(), todoBuilder({ id: testTodoId(2) })];
		await controller.remove(testActor(), testTodoId());
		const result = await controller.list(testActor(), {});
		expect(result.todos.map((view) => view.todo.id)).toEqual([testTodoId(2)]);
	});

	it('removing an unknown todo reports not found', async () => {
		const { controller } = setup();
		await expect(controller.remove(testActor(), testTodoId())).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});

	it('cannot remove another user’s todo', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder({ userId: testActor(2).userId })];
		await expect(controller.remove(testActor(), testTodoId())).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

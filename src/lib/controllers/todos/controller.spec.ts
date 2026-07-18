import { describe, expect, it } from 'vitest';
import { DefaultTodosController, type TodosDependencies } from './controller';
import { InMemoryTodos } from '$lib/testing/fakes/in-memory-todos';
import {
	testActor,
	testProjectId,
	testTodoId,
	todoBuilder
} from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const todos = new InMemoryTodos();
	return {
		todos,
		controller: new DefaultTodosController({
			todoLister: todos,
			todoViewAssembler: todos,
			todoReader: todos,
			todoEditor: todos,
			todoStatusChanger: todos
		} as unknown as TodosDependencies)
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

describe('Todo lifecycle invariants', () => {
	it('completing a todo records a completion timestamp', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder()];
		const result = await controller.update(testActor(), {
			todoId: testTodoId(),
			status: 'done'
		});
		expect(result.todo.completedAt).toBeDefined();
	});

	it('reopening a completed todo clears its completion timestamp', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder({ status: 'done', completedAt: '2026-07-10T09:00:00Z' as never })];
		const result = await controller.update(testActor(), {
			todoId: testTodoId(),
			status: 'open'
		});
		expect(result.todo.completedAt).toBeUndefined();
	});
});

describe('Todo query isolation invariants', () => {
	it('project filtering returns only todos in that project', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder(), todoBuilder({ id: testTodoId(2), projectId: testProjectId(2) })];
		const result = await controller.list(testActor(), { projectId: testProjectId() });
		expect(result.todos.map((view) => view.todo.id)).toEqual([testTodoId()]);
	});

	it('active lists exclude deleted todos', async () => {
		const { todos, controller } = setup();
		todos.todos = [
			todoBuilder(),
			todoBuilder({ id: testTodoId(2), deletedAt: '2026-07-10T09:00:00Z' as never })
		];
		const result = await controller.list(testActor(), {});
		expect(result.todos.map((view) => view.todo.id)).toEqual([testTodoId()]);
	});

	it('active lists exclude another user’s todos', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder(), todoBuilder({ id: testTodoId(2), userId: testActor(2).userId })];
		const result = await controller.list(testActor(), {});
		expect(result.todos.map((view) => view.todo.id)).toEqual([testTodoId()]);
	});
});

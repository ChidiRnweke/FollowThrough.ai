import { describe, expect, it } from 'vitest';
import { Todos, type TodosDependencies } from './controller';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	testActor,
	testProjectId,
	testTodoId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const todos = new InMemoryTodos();
	return {
		todos,
		controller: new Todos(
			capabilityDependencies<TodosDependencies>({
				todoLister: todos,
				todoViewAssembler: todos,
				todoReader: todos,
				todoEditor: todos,
				todoDeleter: todos,
				todoStatusChanger: todos
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

	it('lists distinct categories for the actor, sorted', async () => {
		const { todos, controller } = setup();
		todos.todos = [
			todoBuilder({ category: 'Release 2.0' }),
			todoBuilder({ id: testTodoId(2), category: 'Client work' }),
			todoBuilder({ id: testTodoId(3), category: 'Client work' }),
			todoBuilder({ id: testTodoId(4) })
		];
		await expect(controller.listCategories(testActor())).resolves.toEqual([
			'Client work',
			'Release 2.0'
		]);
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
	it('assembles an actor-scoped todo detail', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder()];
		const result = await controller.get(testActor(), { todoId: testTodoId() });
		expect(result.todo.id).toBe(testTodoId());
	});

	it('does not reveal another user’s todo detail', async () => {
		const { todos, controller } = setup();
		todos.todos = [todoBuilder()];
		await expect(controller.get(testActor(2), { todoId: testTodoId() })).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
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

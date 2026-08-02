import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TodoCard from './todo-card.svelte';
import type { Todo, TodoView } from '$lib/models/todos';

const id = '00000000-0000-4000-8000-000000000001' as Todo['id'];

const todo = (overrides: Partial<Todo> = {}): Todo => ({
	id,
	userId: '10000000-0000-4000-8000-000000000001' as Todo['userId'],
	projectId: '20000000-0000-4000-8000-000000000001' as Todo['projectId'],
	title: 'Ship the manifest',
	status: 'open',
	responsibility: 'mine',
	createdAt: '2026-07-12T08:00:00.000Z' as Todo['createdAt'],
	updatedAt: '2026-07-12T08:00:00.000Z' as Todo['updatedAt'],
	...overrides
});

const view = (overrides: Partial<TodoView> = {}): TodoView => ({
	todo: todo(),
	...overrides
});

describe('TodoCard metadata badges', () => {
	it('omits badges when no metadata is set', async () => {
		const screen = await render(TodoCard, { view: view() });
		expect({
			noPriority: (await screen.getByText('No priority').all()).length,
			noDueDate: (await screen.getByText('No due date').all()).length,
			noSource: (await screen.getByText('No source').all()).length
		}).toEqual({ noPriority: 0, noDueDate: 0, noSource: 0 });
	});

	it('renders a due-date badge when the todo carries one', async () => {
		const screen = await render(TodoCard, {
			view: view({ todo: todo({ dueDate: '2026-08-15' as Todo['dueDate'] }) })
		});
		expect(await screen.getByText('15 Aug').all()).not.toHaveLength(0);
	});
});

describe('TodoCard status intent', () => {
	it('completes the todo through onstatus', async () => {
		const statuses: string[] = [];
		const screen = await render(TodoCard, {
			view: view(),
			onstatus: (todoId, status) => statuses.push(`${todoId}:${status}`)
		});
		await screen.getByRole('checkbox', { name: 'Complete todo' }).click();
		await vi.waitFor(() => expect(statuses).toEqual([`${id}:done`]));
	});
});

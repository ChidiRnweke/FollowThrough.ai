import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../../routes/layout.css';
import TodoRow from './todo-row.svelte';
import type { Todo, TodoView } from '$lib/models/todos';
import type { LocalDate } from '$lib/models/workspace';
import { todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

const id = '00000000-0000-4000-8000-000000000001' as Todo['id'];

const todo = (overrides: Partial<Todo> = {}): Todo =>
	todoBuilder({
		id,
		userId: '10000000-0000-4000-8000-000000000001' as Todo['userId'],
		projectId: '20000000-0000-4000-8000-000000000001' as Todo['projectId'],
		title: 'Ship the manifest',
		responsibility: 'mine',
		createdAt: '2026-07-12T08:00:00.000Z' as Todo['createdAt'],
		updatedAt: '2026-07-12T08:00:00.000Z' as Todo['updatedAt'],
		...overrides
	});

const view = (overrides: Partial<TodoView> = {}): TodoView => ({
	todo: todo(),
	...overrides
});

describe('TodoRow metadata line', () => {
	it('shows only the title when no metadata is set', async () => {
		const screen = await render(TodoRow, { view: view() });
		expect(screen.container.textContent?.trim()).toBe('Ship the manifest');
	});

	it('states the due date when the todo carries one', async () => {
		const screen = await render(TodoRow, {
			view: view({ todo: todo({ dueDate: '2026-08-15' as Todo['dueDate'] }) }),
			today: '2026-08-01' as LocalDate
		});
		expect(await screen.getByText('Due 15 Aug').all()).toHaveLength(1);
	});

	it('names an overdue date in words, not only in colour', async () => {
		const screen = await render(TodoRow, {
			view: view({ todo: todo({ dueDate: '2026-08-15' as Todo['dueDate'] }) }),
			today: '2026-08-20' as LocalDate
		});
		expect(await screen.getByText('Overdue 15 Aug').all()).toHaveLength(1);
	});

	it('names the project the todo belongs to', async () => {
		const screen = await render(TodoRow, { view: view(), projectName: 'Docs site relaunch' });
		expect(await screen.getByText('Docs site relaunch').all()).toHaveLength(1);
	});
});

describe('TodoRow status intent', () => {
	it('completes the todo through onstatus', async () => {
		const statuses: string[] = [];
		const screen = await render(TodoRow, {
			view: view(),
			onstatus: (todoId, status) => statuses.push(`${todoId}:${status}`)
		});
		await screen.getByRole('checkbox', { name: 'Complete todo' }).click();
		await vi.waitFor(() => expect(statuses).toEqual([`${id}:done`]));
	});

	it('sweeps a line through the title while the completion settles', async () => {
		const screen = await render(TodoRow, {
			view: view(),
			onstatus: () => undefined,
			onopen: () => undefined
		});
		await screen.getByRole('checkbox', { name: 'Complete todo' }).click();
		const title = screen.getByText('Ship the manifest').element();
		await expect.poll(() => getComputedStyle(title).animationName).toBe('strike-sweep');
	});
});

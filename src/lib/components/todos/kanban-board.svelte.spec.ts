import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	SHADOW_ITEM_MARKER_PROPERTY_NAME,
	SHADOW_PLACEHOLDER_ITEM_ID,
	SOURCES,
	TRIGGERS,
	type DndEvent
} from 'svelte-dnd-action';
import type { TodoId, TodoStatus, TodoView } from '$lib/models/todos';
import { testTodoId, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import KanbanBoard from './kanban-board.svelte';

interface BoardItem {
	id: TodoId;
	view: TodoView;
}

const view = (id: number, status: TodoStatus): TodoView => ({
	todo: todoBuilder({ id: testTodoId(id), status, title: `Todo ${id}` })
});

const dispatchDnd = (
	status: TodoStatus,
	type: 'consider' | 'finalize',
	detail: DndEvent<BoardItem>
): void => {
	const zone = document.querySelector(`[data-todo-status="${status}"]`);
	if (!zone) throw new Error(`Missing ${status} drop zone`);
	zone.dispatchEvent(new CustomEvent(type, { detail }));
};

describe('KanbanBoard quick-add focus', () => {
	it('focuses the add input when the add row opens', async () => {
		const screen = await render(KanbanBoard, { todos: [] });
		await screen.getByRole('button', { name: 'Add todo to Open' }).click();
		expect((document.activeElement as HTMLElement | null)?.id).toBe('quick-todo-input');
	});

	it('Escape closes the add row', async () => {
		const screen = await render(KanbanBoard, { todos: [] });
		await screen.getByRole('button', { name: 'Add todo to Open' }).click();
		const input = screen.getByPlaceholder('Todo title…');
		await input.fill('A draft');
		input.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await vi.waitFor(async () => {
			expect(await screen.getByPlaceholder('Todo title…').all()).toHaveLength(0);
		});
	});
});

describe('KanbanBoard status drops', () => {
	it('commits a tail drop when the collapsed target items omit the dragged todo', async () => {
		const done = Array.from({ length: 6 }, (_, index) => view(index + 1, 'done'));
		const moving = view(20, 'in_progress');
		const moves: Array<{ id: TodoId; status: TodoStatus }> = [];
		await render(KanbanBoard, {
			todos: [...done, moving],
			onmove: (id, status) => moves.push({ id, status })
		});

		dispatchDnd('done', 'finalize', {
			items: done.slice(0, 5).map((item) => ({ id: item.todo.id, view: item })),
			info: {
				id: moving.todo.id,
				trigger: TRIGGERS.DROPPED_INTO_ZONE,
				source: SOURCES.POINTER
			}
		});

		expect(moves).toEqual([{ id: moving.todo.id, status: 'done' }]);
	});

	it('commits a cross-column drop only from the target finalize event', async () => {
		const moving = view(20, 'in_progress');
		const moves: Array<{ id: TodoId; status: TodoStatus }> = [];
		await render(KanbanBoard, {
			todos: [moving],
			onmove: (id, status) => moves.push({ id, status })
		});
		const movedItem = { id: moving.todo.id, view: moving };

		dispatchDnd('done', 'finalize', {
			items: [movedItem],
			info: {
				id: moving.todo.id,
				trigger: TRIGGERS.DROPPED_INTO_ZONE,
				source: SOURCES.POINTER
			}
		});
		dispatchDnd('in_progress', 'finalize', {
			items: [],
			info: {
				id: moving.todo.id,
				trigger: TRIGGERS.DROPPED_INTO_ANOTHER,
				source: SOURCES.POINTER
			}
		});

		expect(moves).toHaveLength(1);
	});

	it('does not commit a drop into the todo current status', async () => {
		const moving = view(20, 'done');
		const moves: Array<{ id: TodoId; status: TodoStatus }> = [];
		await render(KanbanBoard, {
			todos: [moving],
			onmove: (id, status) => moves.push({ id, status })
		});

		dispatchDnd('done', 'finalize', {
			items: [{ id: moving.todo.id, view: moving }],
			info: {
				id: moving.todo.id,
				trigger: TRIGGERS.DROPPED_INTO_ZONE,
				source: SOURCES.POINTER
			}
		});

		expect(moves).toHaveLength(0);
	});

	it('keeps the tail placeholder rendered in a collapsed target', async () => {
		const done = Array.from({ length: 6 }, (_, index) => view(index + 1, 'done'));
		const moving = view(20, 'in_progress');
		await render(KanbanBoard, { todos: [...done, moving], columns: ['done'] });
		const shadow = {
			id: SHADOW_PLACEHOLDER_ITEM_ID as TodoId,
			view: moving,
			[SHADOW_ITEM_MARKER_PROPERTY_NAME]: true
		};

		dispatchDnd('done', 'consider', {
			items: [...done.slice(0, 5).map((item) => ({ id: item.todo.id, view: item })), shadow],
			info: {
				id: moving.todo.id,
				trigger: TRIGGERS.DRAGGED_ENTERED,
				source: SOURCES.POINTER
			}
		});

		await vi.waitFor(() => {
			expect(document.querySelector('[data-todo-status="done"]')?.children).toHaveLength(6);
		});
	});
});

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import KanbanBoard from './kanban-board.svelte';

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

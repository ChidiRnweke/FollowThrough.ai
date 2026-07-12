import { invalidateAll } from '$app/navigation';
import type { TodoId, TodoStatus, UpdateTodoOutput } from '$lib/models';
import { noteTodos } from './note-todos.svelte';
import { rightPanel } from './right-panel.svelte';

class TodoUpdatesStore {
	busy = $state(false);

	async setStatus(todoId: TodoId, status: TodoStatus): Promise<boolean> {
		this.busy = true;
		try {
			const response = await fetch('/api/todos', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ todoId, status })
			});
			if (!response.ok) return false;
			const output = (await response.json()) as UpdateTodoOutput;
			if (rightPanel.todoView?.todo.id === todoId) {
				rightPanel.todoView = { ...rightPanel.todoView, todo: output.todo };
			}
			noteTodos.apply(output.todo);
			await invalidateAll();
			return true;
		} catch {
			return false;
		} finally {
			this.busy = false;
		}
	}
}

export const todoUpdates = new TodoUpdatesStore();

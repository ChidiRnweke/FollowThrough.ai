import { invalidateAll } from '$app/navigation';
import type { ProjectId, TodoId, TodoStatus } from '$lib/models';
import { updateTodoStatus, createTodo } from '$lib/remote/todos.remote';
import { noteTodos } from './note-todos.svelte';
import { rightPanel } from './right-panel.svelte';

class TodoUpdatesStore {
	busy = $state(false);

	async setStatus(todoId: TodoId, status: TodoStatus): Promise<boolean> {
		this.busy = true;
		try {
			const output = await updateTodoStatus({ todoId, status });
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

	async create(title: string, projectId?: ProjectId, status?: TodoStatus): Promise<boolean> {
		this.busy = true;
		try {
			await createTodo({ title: title, projectId, status });
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

import { invalidateAll } from '$app/navigation';
import type { ProjectId, TodoId, TodoStatus, UpdateTodoInput } from '$lib/models';
import { updateTodo as updateTodoCommand, createTodo } from '$lib/remote/todos.remote';
import { noteTodos } from './note-todos.svelte';
import { rightPanel } from './right-panel.svelte';

class TodoUpdatesStore {
	creating = $state(false);
	pendingIds = $state(new Set<TodoId>());

	isPending(todoId: TodoId): boolean {
		return this.pendingIds.has(todoId);
	}

	async updateTodo(todoId: TodoId, patch: Omit<UpdateTodoInput, 'todoId'>): Promise<boolean> {
		this.pendingIds = new Set(this.pendingIds).add(todoId);
		try {
			const output = await updateTodoCommand({ todoId, ...patch });
			if (rightPanel.todoView?.todo.id === todoId) rightPanel.todoView = output.view;
			noteTodos.apply(output.todo);
			await invalidateAll();
			return true;
		} catch {
			return false;
		} finally {
			const pending = new Set(this.pendingIds);
			pending.delete(todoId);
			this.pendingIds = pending;
		}
	}

	async setStatus(todoId: TodoId, status: TodoStatus): Promise<boolean> {
		return this.updateTodo(todoId, { status });
	}

	async create(title: string, projectId?: ProjectId, status?: TodoStatus): Promise<boolean> {
		this.creating = true;
		try {
			await createTodo({ title: title, projectId, status });
			await invalidateAll();
			return true;
		} catch {
			return false;
		} finally {
			this.creating = false;
		}
	}
}

export const todoUpdates = new TodoUpdatesStore();

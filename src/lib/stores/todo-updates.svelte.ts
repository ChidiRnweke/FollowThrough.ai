import { invalidateAll } from '$app/navigation';
import { SvelteSet } from 'svelte/reactivity';
import type { ProjectId, TodoId, TodoStatus, UpdateTodoInput } from '$lib/models';
import { updateTodo as updateTodoCommand, createTodo, deleteTodo } from '$lib/remote/todos.remote';
import { applyTodoAcrossHeldStores } from './registries/note-todos-registry.svelte';
import { rightPanel } from './right-panel.svelte';

class TodoUpdatesStore {
	creating = $state(false);
	pendingIds = new SvelteSet<TodoId>();

	isPending(todoId: TodoId): boolean {
		return this.pendingIds.has(todoId);
	}

	async updateTodo(todoId: TodoId, patch: Omit<UpdateTodoInput, 'todoId'>): Promise<boolean> {
		this.pendingIds.add(todoId);
		try {
			const output = await updateTodoCommand({ todoId, ...patch });
			if (rightPanel.todoView?.todo.id === todoId) rightPanel.todoView = output.view;
			// Cross-pane fan-out: whichever open note currently holds this todo
			// (usually the source note) sees the mutation in place.
			applyTodoAcrossHeldStores(output.todo);
			await invalidateAll();
			return true;
		} catch {
			return false;
		} finally {
			this.pendingIds.delete(todoId);
		}
	}

	async setStatus(todoId: TodoId, status: TodoStatus): Promise<boolean> {
		return this.updateTodo(todoId, { status });
	}

	async remove(todoId: TodoId): Promise<boolean> {
		this.pendingIds.add(todoId);
		try {
			await deleteTodo({ todoId });
			if (rightPanel.todoView?.todo.id === todoId) rightPanel.close();
			await invalidateAll();
			return true;
		} catch {
			return false;
		} finally {
			this.pendingIds.delete(todoId);
		}
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

import type { Todo, TodoId, TodoView } from '$lib/models';

class NoteTodosStore {
	views = $state<TodoView[]>([]);

	replace(views: readonly TodoView[]): void {
		this.views = [...views];
	}
	get(todoId: TodoId): TodoView | undefined {
		return this.views.find((view) => view.todo.id === todoId);
	}
	apply(todo: Todo): void {
		this.views = this.views.map((view) => (view.todo.id === todo.id ? { ...view, todo } : view));
	}
	clear(): void {
		this.views = [];
	}
}

export const noteTodos = new NoteTodosStore();

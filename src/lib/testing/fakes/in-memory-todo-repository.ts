import type { ActorContext, Todo, TodoId, TodoListFilter } from '$lib/models';
import type { TodoRepository } from '$lib/server/repositories/todos';

export class InMemoryTodoRepository implements TodoRepository {
	todos: Todo[] = [];

	async findById(actor: ActorContext, id: TodoId): Promise<Todo | undefined> {
		return this.todos.find(
			(todo) => todo.id === id && todo.userId === actor.userId && !todo.deletedAt
		);
	}

	async list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]> {
		return this.todos.filter(
			(todo) =>
				todo.userId === actor.userId &&
				!todo.deletedAt &&
				(filter.projectId === undefined || todo.projectId === filter.projectId) &&
				(filter.status === undefined || todo.status === filter.status) &&
				(filter.responsibility === undefined || todo.responsibility === filter.responsibility) &&
				(filter.dueBefore === undefined ||
					(todo.dueDate !== undefined && todo.dueDate <= filter.dueBefore)) &&
				(filter.category === undefined || todo.category === filter.category)
		);
	}

	async count(actor: ActorContext, filter: TodoListFilter): Promise<number> {
		return (await this.list(actor, filter)).length;
	}

	async listCategories(actor: ActorContext): Promise<readonly string[]> {
		return [
			...new Set(
				this.todos
					.filter((todo) => todo.userId === actor.userId && !todo.deletedAt && todo.category)
					.map((todo) => todo.category!)
			)
		].sort();
	}

	async insert(_actor: ActorContext, todo: Todo): Promise<Todo> {
		this.todos.push(todo);
		return todo;
	}
	async update(_actor: ActorContext, todo: Todo): Promise<Todo> {
		this.todos = this.todos.map((item) => (item.id === todo.id ? todo : item));
		return todo;
	}
	async softDelete(_actor: ActorContext, id: TodoId, deletedAt: Todo['deletedAt']): Promise<void> {
		this.todos = this.todos.map((todo) => (todo.id === id ? { ...todo, deletedAt } : todo));
	}
}

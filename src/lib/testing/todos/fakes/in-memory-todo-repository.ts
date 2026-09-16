import type { ActorContext } from '$lib/models/identity';
import { NotFoundError } from '$lib/errors';
import type { Todo, TodoId, TodoListFilter, TodoStatus } from '$lib/models/todos';
import type { TodoRepository } from '$lib/server/repositories/todos/todos';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export class InMemoryTodoRepository implements TodoRepository, SnapshotParticipant {
	todos: Todo[] = [];
	updateFailures = new Map<TodoStatus, Error>();
	insertFailures = new Map<string, Error>();
	snapshot(): RestoreSnapshot {
		const todos = structuredClone(this.todos);
		return () => {
			this.todos = todos;
		};
	}

	findForUpdate(actor: ActorContext, id: TodoId): Promise<Todo | undefined> {
		return this.findById(actor, id);
	}

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
		const failure = this.insertFailures.get(todo.title);
		if (failure) throw failure;
		this.todos.push(todo);
		return todo;
	}
	async update(actor: ActorContext, todo: Todo): Promise<Todo> {
		if (!(await this.findById(actor, todo.id))) throw new NotFoundError('Todo was not found');
		const failure = this.updateFailures.get(todo.status);
		if (failure) throw failure;
		this.todos = this.todos.map((item) => (item.id === todo.id ? todo : item));
		return todo;
	}
	async softDelete(_actor: ActorContext, id: TodoId, deletedAt: Todo['deletedAt']): Promise<void> {
		this.todos = this.todos.map((todo) => (todo.id === id ? { ...todo, deletedAt } : todo));
	}
}

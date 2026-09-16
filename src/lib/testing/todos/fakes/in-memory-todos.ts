import type { ActorContext } from '$lib/models/identity';
import type {
	CreateTodoInput,
	Todo,
	TodoId,
	TodoListFilter,
	UpdateTodoInput,
	TodoView
} from '$lib/models/todos';
import { applyTodoEdit } from '$lib/models/todos';
import { NotFoundError, ValidationError } from '$lib/errors';
import type {
	TodoDeleter,
	TodoEditor,
	TodoCreator,
	TodoLister,
	TodoReader,
	TodoViewAssembler,
	WaitingOnFinder
} from '$lib/server/services/todos/contracts';
import { testNow, testTodoId, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export class InMemoryTodos
	implements
		TodoCreator,
		TodoReader,
		TodoEditor,
		TodoDeleter,
		TodoLister,
		TodoViewAssembler,
		WaitingOnFinder,
		SnapshotParticipant
{
	todos: Todo[] = [];

	findWaitingOn(actor: ActorContext): Promise<readonly Todo[]> {
		return this.list(actor, { responsibility: 'waiting_on' });
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

	async create(actor: ActorContext, input: CreateTodoInput): Promise<Todo> {
		if (!input.projectId) throw new ValidationError('Todo project is required');
		if (!input.title.trim()) throw new ValidationError('Todo title is required');
		const todo = todoBuilder({
			id: input.id ?? testTodoId(this.todos.length + 1),
			userId: actor.userId,
			projectId: input.projectId,
			title: input.title.trim(),
			status: input.status ?? 'open',
			...(input.status === 'done' ? { completedAt: testNow } : {}),
			responsibility: input.responsibility,
			...(input.description !== undefined ? { description: input.description } : {}),
			...(input.responsibility === 'waiting_on' && input.waitingOn?.trim()
				? { waitingOn: input.waitingOn.trim() }
				: {}),
			...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
			...(input.dueDateVerbatim !== undefined ? { dueDateVerbatim: input.dueDateVerbatim } : {}),
			...(input.promiseStrength !== undefined ? { promiseStrength: input.promiseStrength } : {}),
			...(input.sourceAnchorId !== undefined ? { sourceAnchorId: input.sourceAnchorId } : {}),
			...(input.provenanceId !== undefined ? { provenanceId: input.provenanceId } : {})
		});
		this.todos.push(todo);
		return todo;
	}

	async get(actor: ActorContext, todoId: TodoId): Promise<Todo> {
		const todo = this.todos.find(
			(candidate) => candidate.id === todoId && candidate.userId === actor.userId
		);
		if (!todo) throw new NotFoundError('Todo was not found');
		return todo;
	}

	async update(actor: ActorContext, input: UpdateTodoInput): Promise<Todo> {
		const current = await this.get(actor, input.todoId);
		const updated = applyTodoEdit(current, input, testNow);
		if (!updated.title) throw new ValidationError('Todo title is required');
		this.todos = this.todos.map((candidate) => (candidate.id === current.id ? updated : candidate));
		return updated;
	}

	async softDelete(actor: ActorContext, todoId: TodoId): Promise<void> {
		const current = await this.get(actor, todoId);
		const deleted: Todo = { ...current, deletedAt: testNow, updatedAt: testNow };
		this.todos = this.todos.map((candidate) => (candidate.id === todoId ? deleted : candidate));
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

	async assemble(_actor: ActorContext, todos: readonly Todo[]): Promise<readonly TodoView[]> {
		return todos.map((todo) => ({ todo }));
	}

	snapshot(): RestoreSnapshot {
		const todos = structuredClone(this.todos);
		return () => {
			this.todos = todos;
		};
	}
}

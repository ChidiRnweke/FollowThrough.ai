import type {
	ActorContext,
	CreateTodoInput,
	Todo,
	TodoId,
	TodoListFilter,
	TodoStatus,
	TodoView
} from '$lib/models';
import { NotFoundError, OwnershipError, ValidationError } from '$lib/models';
import type {
	TodoDeleter,
	TodoEditor,
	TodoCreator,
	TodoLister,
	TodoReader,
	TodoStatusChanger,
	TodoViewAssembler
} from '$lib/services';
import { testNow, testTodoId, todoBuilder } from '../fixtures/domain-builders';
import type { SnapshotParticipant } from './in-memory-transaction';

export class InMemoryTodos
	implements
		TodoCreator,
		TodoReader,
		TodoEditor,
		TodoDeleter,
		TodoStatusChanger,
		TodoLister,
		TodoViewAssembler,
		SnapshotParticipant
{
	todos: Todo[] = [];

	async create(actor: ActorContext, input: CreateTodoInput): Promise<Todo> {
		if (!input.projectId) throw new ValidationError('Todo project is required');
		if (!input.title.trim()) throw new ValidationError('Todo title is required');
		const todo = todoBuilder({
			id: testTodoId(this.todos.length + 1),
			userId: actor.userId,
			projectId: input.projectId,
			title: input.title.trim(),
			responsibility: input.responsibility,
			...(input.description !== undefined ? { description: input.description } : {}),
			...(input.waitingOn !== undefined ? { waitingOn: input.waitingOn } : {}),
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

	async update(actor: ActorContext, todo: Todo): Promise<Todo> {
		if (todo.userId !== actor.userId) throw new OwnershipError('Cannot update another user’s todo');
		if (!todo.title.trim()) throw new ValidationError('Todo title is required');
		const current = await this.get(actor, todo.id);
		if (todo.projectId !== current.projectId)
			throw new ValidationError('A todo cannot move between projects during an edit');
		const updated = { ...todo, title: todo.title.trim(), updatedAt: testNow };
		this.todos = this.todos.map((candidate) => (candidate.id === todo.id ? updated : candidate));
		return updated;
	}

	async softDelete(actor: ActorContext, todoId: TodoId): Promise<void> {
		const current = await this.get(actor, todoId);
		const deleted: Todo = { ...current, deletedAt: testNow, updatedAt: testNow };
		this.todos = this.todos.map((candidate) => (candidate.id === todoId ? deleted : candidate));
	}

	async change(actor: ActorContext, todoId: TodoId, status: TodoStatus): Promise<Todo> {
		const current = await this.get(actor, todoId);
		const { completedAt: _completedAt, ...withoutCompletion } = current;
		void _completedAt;
		const updated: Todo = {
			...withoutCompletion,
			status,
			...(status === 'done' ? { completedAt: testNow } : {}),
			updatedAt: testNow
		};
		this.todos = this.todos.map((candidate) => (candidate.id === todoId ? updated : candidate));
		return updated;
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
					(todo.dueDate !== undefined && todo.dueDate <= filter.dueBefore))
		);
	}

	async assemble(_actor: ActorContext, todos: readonly Todo[]): Promise<readonly TodoView[]> {
		return todos.map((todo) => ({ todo }));
	}

	snapshot(): unknown {
		return structuredClone(this.todos);
	}

	restore(snapshot: unknown): void {
		this.todos = snapshot as Todo[];
	}
}

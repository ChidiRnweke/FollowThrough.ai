import type { ActorContext } from '$lib/models/identity';
import type { Note } from '$lib/models/notes';
import type { Todo, TodoId, TodoListFilter, TodoContext } from '$lib/models/todos';
import { NotFoundError, OwnershipError, ValidationError } from '$lib/errors';
import type {
	TodoDeleter,
	TodoEditor,
	TodoCreator,
	TodoLister,
	TodoReader,
	TodoContextReader,
	WaitingOnFinder
} from '$lib/server/services/todos/catalog';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';
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
		TodoContextReader,
		WaitingOnFinder,
		SnapshotParticipant
{
	constructor(private readonly actor: ActorContext) {}
	todos: Todo[] = [];
	notes: Note[] = [];

	async validateLinkedNote(
		noteId: NonNullable<Todo['linkedNoteId']>,
		projectId: Todo['projectId']
	): Promise<void> {
		if (
			!this.notes.some(
				(note) =>
					note.id === noteId &&
					note.userId === this.actor.userId &&
					note.projectId === projectId &&
					note.kind === 'note' &&
					!note.archivedAt
			)
		) {
			throw new NotFoundError('Todo linked note was not found');
		}
	}

	findWaitingOn(): Promise<readonly Todo[]> {
		return this.list({ responsibility: 'waiting_on' });
	}

	async count(filter: TodoListFilter): Promise<number> {
		return (await this.list(filter)).length;
	}

	async listCategories(): Promise<readonly string[]> {
		return [
			...new Set(
				this.todos
					.filter((todo) => todo.userId === this.actor.userId && !todo.deletedAt && todo.category)
					.map((todo) => todo.category!)
			)
		].sort();
	}

	async create(todo: Todo): Promise<Todo> {
		if (todo.userId !== this.actor.userId)
			throw new OwnershipError('Cannot create another user’s task');
		this.todos.push(todo);
		return todo;
	}

	async get(todoId: TodoId): Promise<Todo> {
		const todo = this.todos.find(
			(candidate) =>
				candidate.id === todoId && candidate.userId === this.actor.userId && !candidate.deletedAt
		);
		if (!todo) throw new NotFoundError('Todo was not found');
		return todo;
	}

	getForEdit(todoId: TodoId): Promise<Todo> {
		return this.get(todoId);
	}

	async update(updated: Todo): Promise<Todo> {
		const current = await this.get(updated.id);
		if (!updated.title) throw new ValidationError('Todo title is required');
		this.todos = this.todos.map((candidate) => (candidate.id === current.id ? updated : candidate));
		return updated;
	}

	async softDelete(todoId: TodoId): Promise<void> {
		const current = await this.get(todoId);
		const deleted: Todo = { ...current, deletedAt: testNow, updatedAt: testNow };
		this.todos = this.todos.map((candidate) => (candidate.id === todoId ? deleted : candidate));
	}

	async list(filter: TodoListFilter): Promise<readonly Todo[]> {
		return this.todos.filter(
			(todo) =>
				todo.userId === this.actor.userId &&
				!todo.deletedAt &&
				(filter.projectId === undefined || todo.projectId === filter.projectId) &&
				(filter.status === undefined || todo.status === filter.status) &&
				(filter.responsibility === undefined || todo.responsibility === filter.responsibility) &&
				(filter.dueBefore === undefined ||
					(todo.dueDate !== undefined && todo.dueDate <= filter.dueBefore)) &&
				(filter.category === undefined || todo.category === filter.category)
		);
	}

	async readContexts(todos: readonly Todo[]): Promise<readonly TodoContext[]> {
		return Promise.all(todos.map((todo) => this.readContext(todo)));
	}

	async readContext(todo: Todo): Promise<TodoContext> {
		return {
			todo,
			anchor: null,
			origin: null,
			linked: null,
			provenance: null
		};
	}

	snapshot(): RestoreSnapshot {
		const todos = structuredClone(this.todos);
		return () => {
			this.todos = todos;
		};
	}
}

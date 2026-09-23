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
} from '$lib/server/services/todos/contracts';
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
	todos: Todo[] = [];
	notes: Note[] = [];

	async validateLinkedNote(
		actor: ActorContext,
		noteId: NonNullable<Todo['linkedNoteId']>,
		projectId: Todo['projectId']
	): Promise<void> {
		if (
			!this.notes.some(
				(note) =>
					note.id === noteId &&
					note.userId === actor.userId &&
					note.projectId === projectId &&
					note.kind === 'note' &&
					!note.archivedAt
			)
		) {
			throw new NotFoundError('Todo linked note was not found');
		}
	}

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

	async create(actor: ActorContext, todo: Todo): Promise<Todo> {
		if (todo.userId !== actor.userId) throw new OwnershipError('Cannot create another user’s task');
		this.todos.push(todo);
		return todo;
	}

	async get(actor: ActorContext, todoId: TodoId): Promise<Todo> {
		const todo = this.todos.find(
			(candidate) =>
				candidate.id === todoId && candidate.userId === actor.userId && !candidate.deletedAt
		);
		if (!todo) throw new NotFoundError('Todo was not found');
		return todo;
	}

	getForEdit(actor: ActorContext, todoId: TodoId): Promise<Todo> {
		return this.get(actor, todoId);
	}

	async update(actor: ActorContext, updated: Todo): Promise<Todo> {
		const current = await this.get(actor, updated.id);
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

	async readContexts(actor: ActorContext, todos: readonly Todo[]): Promise<readonly TodoContext[]> {
		return Promise.all(todos.map((todo) => this.readContext(actor, todo)));
	}

	async readContext(_actor: ActorContext, todo: Todo): Promise<TodoContext> {
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

import type { ActorContext } from '$lib/models/identity';
import type { Todo, TodoId, TodoListFilter, TodoContext } from '$lib/models/todos';
import type { DateTime } from '$lib/models/workspace';
import { NotFoundError, OwnershipError, ValidationError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import type { TodoRepository } from '$lib/server/repositories/todos/todos';
export interface TodoCreator {
	create(todo: Todo): Promise<Todo>;
}
export interface TodoReader {
	get(todoId: TodoId): Promise<Todo>;
}
export interface TodoEditor {
	getForEdit(todoId: TodoId): Promise<Todo>;
	/** Validate a requested assignment; existing links can outlive note archival. */
	validateLinkedNote(
		noteId: NonNullable<Todo['linkedNoteId']>,
		projectId: Todo['projectId']
	): Promise<void>;
	update(todo: Todo): Promise<Todo>;
}
export interface TodoDeleter {
	softDelete(todoId: TodoId): Promise<void>;
}
export interface WaitingOnFinder {
	findWaitingOn(): Promise<readonly Todo[]>;
}
export interface TodoLister {
	list(filter: TodoListFilter): Promise<readonly Todo[]>;
	count(filter: TodoListFilter): Promise<number>;
	listCategories(): Promise<readonly string[]>;
}
export interface TodoContextReader {
	readContext(todo: Todo): Promise<TodoContext>;
	readContexts(todos: readonly Todo[]): Promise<readonly TodoContext[]>;
}

/** Everything the todos controller needs from the catalog, as one seam. */
export interface TodoLibrary
	extends
		TodoCreator,
		TodoReader,
		TodoLister,
		WaitingOnFinder,
		TodoEditor,
		TodoDeleter,
		TodoContextReader {}

export class TodoCatalog implements TodoLibrary {
	constructor(
		private readonly actor: ActorContext,
		private readonly todos: TodoRepository,
		private readonly projects: ProjectRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly now: () => DateTime
	) {}

	async create(todo: Todo): Promise<Todo> {
		if (todo.userId !== this.actor.userId)
			throw new OwnershipError('Cannot create another user’s task');
		if (!(await this.projects.findById(todo.projectId)))
			throw new NotFoundError('Todo project was not found');
		await this.validateReferences(todo);
		return this.todos.insert(todo);
	}

	async get(todoId: TodoId): Promise<Todo> {
		const todo = await this.todos.findById(todoId);
		if (!todo) throw new NotFoundError('Todo was not found', { todoId });
		return todo;
	}
	list(filter: TodoListFilter): Promise<readonly Todo[]> {
		return this.todos.list(filter);
	}
	count(filter: TodoListFilter): Promise<number> {
		return this.todos.count(filter);
	}
	listCategories(): Promise<readonly string[]> {
		return this.todos.listCategories();
	}
	findWaitingOn(): Promise<readonly Todo[]> {
		return this.list({ responsibility: 'waiting_on' });
	}

	async getForEdit(todoId: TodoId): Promise<Todo> {
		const todo = await this.todos.findForUpdate(todoId);
		if (!todo) throw new NotFoundError('Todo was not found', { todoId });
		return todo;
	}
	async update(todo: Todo): Promise<Todo> {
		if (todo.userId !== this.actor.userId)
			throw new OwnershipError('Cannot edit another user’s task');
		if (!todo.title) throw new ValidationError('Todo title is required');
		await this.validateReferences(todo);
		return this.todos.update(todo);
	}
	async validateLinkedNote(
		noteId: NonNullable<Todo['linkedNoteId']>,
		projectId: Todo['projectId']
	): Promise<void> {
		const note = await this.notes.findById(noteId);
		if (!note || note.projectId !== projectId || note.kind !== 'note' || note.archivedAt)
			throw new NotFoundError('Todo linked note was not found');
	}

	async softDelete(todoId: TodoId): Promise<void> {
		await this.get(todoId);
		await this.todos.softDelete(todoId, this.now());
	}

	async readContext(todo: Todo): Promise<TodoContext> {
		const anchor = todo.sourceAnchorId
			? await this.anchors.findById(todo.sourceAnchorId)
			: undefined;
		const origin = anchor ? await this.notes.findById(anchor.noteId) : undefined;
		const linked = todo.linkedNoteId ? await this.notes.findById(todo.linkedNoteId) : undefined;
		const provenance = todo.provenanceId
			? await this.provenance.findById(todo.provenanceId)
			: undefined;
		return {
			todo,
			anchor: anchor ?? null,
			origin: origin ?? null,
			linked: linked ?? null,
			provenance: provenance ?? null
		};
	}
	async readContexts(todos: readonly Todo[]): Promise<readonly TodoContext[]> {
		return Promise.all(todos.map((todo) => this.readContext(todo)));
	}

	private async validateReferences(todo: Todo): Promise<void> {
		if (todo.sourceAnchorId) {
			const anchor = await this.anchors.findById(todo.sourceAnchorId);
			const note = anchor ? await this.notes.findById(anchor.noteId) : undefined;
			if (!anchor || !note || note.projectId !== todo.projectId)
				throw new NotFoundError('Todo source anchor was not found');
		}
		if (todo.provenanceId && !(await this.provenance.findById(todo.provenanceId)))
			throw new NotFoundError('Todo provenance was not found');
	}
}

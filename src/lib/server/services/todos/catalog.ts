import type { ActorContext } from '$lib/models/identity';
import type { CreateTodoInput, Todo, TodoId, TodoListFilter, TodoContext } from '$lib/models/todos';
import type { DateTime } from '$lib/models/workspace';
import { NotFoundError, OwnershipError, ValidationError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import type { TodoRepository } from '$lib/server/repositories/todos/todos';
const now = (): DateTime => new Date().toISOString() as DateTime;

export interface TodoCreator {
	create(actor: ActorContext, todo: Todo): Promise<Todo>;
}
export interface TodoReader {
	get(actor: ActorContext, todoId: TodoId): Promise<Todo>;
}
export interface TodoEditor {
	getForEdit(actor: ActorContext, todoId: TodoId): Promise<Todo>;
	/** Validate a requested assignment; existing links can outlive note archival. */
	validateLinkedNote(
		actor: ActorContext,
		noteId: NonNullable<Todo['linkedNoteId']>,
		projectId: Todo['projectId']
	): Promise<void>;
	update(actor: ActorContext, todo: Todo): Promise<Todo>;
}
export interface TodoDeleter {
	softDelete(actor: ActorContext, todoId: TodoId): Promise<void>;
}
export interface WaitingOnFinder {
	findWaitingOn(actor: ActorContext): Promise<readonly Todo[]>;
}
export interface TodoLister {
	list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]>;
	count(actor: ActorContext, filter: TodoListFilter): Promise<number>;
	listCategories(actor: ActorContext): Promise<readonly string[]>;
}
export interface TodoContextReader {
	readContext(actor: ActorContext, todo: Todo): Promise<TodoContext>;
	readContexts(actor: ActorContext, todos: readonly Todo[]): Promise<readonly TodoContext[]>;
}

async function validateAnchor(
	anchors: SourceAnchorRepository,
	notes: NoteRepository,
	actor: ActorContext,
	anchorId: NonNullable<CreateTodoInput['sourceAnchorId']>,
	projectId: CreateTodoInput['projectId']
): Promise<void> {
	const anchor = await anchors.findById(actor, anchorId);
	const note = anchor ? await notes.findById(actor, anchor.noteId) : undefined;
	if (!anchor || !note || note.projectId !== projectId)
		throw new NotFoundError('Todo source anchor was not found');
}

export class TodoCreationService implements TodoCreator {
	constructor(
		private readonly todos: TodoRepository,
		private readonly projects: ProjectRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async create(actor: ActorContext, todo: Todo): Promise<Todo> {
		if (todo.userId !== actor.userId) throw new OwnershipError('Cannot create another user’s task');
		if (!(await this.projects.findById(actor, todo.projectId)))
			throw new NotFoundError('Todo project was not found');
		if (todo.sourceAnchorId)
			await validateAnchor(this.anchors, this.notes, actor, todo.sourceAnchorId, todo.projectId);
		if (todo.provenanceId && !(await this.provenance.findById(actor, todo.provenanceId)))
			throw new NotFoundError('Todo provenance was not found');
		return this.todos.insert(actor, todo);
	}
}

export class TodoReadingService implements TodoReader, TodoLister, WaitingOnFinder {
	constructor(private readonly todos: TodoRepository) {}
	async get(actor: ActorContext, todoId: TodoId): Promise<Todo> {
		const todo = await this.todos.findById(actor, todoId);
		if (!todo) throw new NotFoundError('Todo was not found', { todoId });
		return todo;
	}
	list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]> {
		return this.todos.list(actor, filter);
	}
	count(actor: ActorContext, filter: TodoListFilter): Promise<number> {
		return this.todos.count(actor, filter);
	}
	listCategories(actor: ActorContext): Promise<readonly string[]> {
		return this.todos.listCategories(actor);
	}
	findWaitingOn(actor: ActorContext): Promise<readonly Todo[]> {
		return this.list(actor, { responsibility: 'waiting_on' });
	}
}

export class TodoEditingService implements TodoEditor {
	constructor(
		private readonly todos: TodoRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async getForEdit(actor: ActorContext, todoId: TodoId): Promise<Todo> {
		const todo = await this.todos.findForUpdate(actor, todoId);
		if (!todo) throw new NotFoundError('Todo was not found', { todoId });
		return todo;
	}
	async update(actor: ActorContext, todo: Todo): Promise<Todo> {
		if (todo.userId !== actor.userId) throw new OwnershipError('Cannot edit another user’s task');
		if (!todo.title) throw new ValidationError('Todo title is required');
		if (todo.sourceAnchorId)
			await validateAnchor(this.anchors, this.notes, actor, todo.sourceAnchorId, todo.projectId);
		if (todo.provenanceId && !(await this.provenance.findById(actor, todo.provenanceId)))
			throw new NotFoundError('Todo provenance was not found');
		return this.todos.update(actor, todo);
	}
	async validateLinkedNote(
		actor: ActorContext,
		noteId: NonNullable<Todo['linkedNoteId']>,
		projectId: Todo['projectId']
	): Promise<void> {
		const note = await this.notes.findById(actor, noteId);
		if (!note || note.projectId !== projectId || note.kind !== 'note' || note.archivedAt)
			throw new NotFoundError('Todo linked note was not found');
	}
}

export class TodoLifecycleService implements TodoDeleter {
	constructor(
		private readonly todos: TodoRepository,
		private readonly clock: () => DateTime = now
	) {}
	async softDelete(actor: ActorContext, todoId: TodoId): Promise<void> {
		if (!(await this.todos.findById(actor, todoId)))
			throw new NotFoundError('Todo was not found', { todoId });
		await this.todos.softDelete(actor, todoId, this.clock());
	}
}

export class TodoContextService implements TodoContextReader {
	constructor(
		private readonly anchors: SourceAnchorRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async readContext(actor: ActorContext, todo: Todo): Promise<TodoContext> {
		const anchor = todo.sourceAnchorId
			? await this.anchors.findById(actor, todo.sourceAnchorId)
			: undefined;
		const origin = anchor ? await this.notes.findById(actor, anchor.noteId) : undefined;
		const linked = todo.linkedNoteId
			? await this.notes.findById(actor, todo.linkedNoteId)
			: undefined;
		const provenance = todo.provenanceId
			? await this.provenance.findById(actor, todo.provenanceId)
			: undefined;
		return {
			todo,
			anchor: anchor ?? null,
			origin: origin ?? null,
			linked: linked ?? null,
			provenance: provenance ?? null
		};
	}
	async readContexts(actor: ActorContext, todos: readonly Todo[]): Promise<readonly TodoContext[]> {
		return Promise.all(todos.map((todo) => this.readContext(actor, todo)));
	}
}

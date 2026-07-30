import type {
	ActorContext,
	CreateTodoInput,
	DateTime,
	Todo,
	TodoId,
	TodoListFilter,
	TodoStatus,
	TodoView
} from '$lib/models';
import { NotFoundError, OwnershipError, ValidationError } from '$lib/errors';
import type {
	NoteRepository,
	ProjectRepository,
	ProvenanceRepository,
	SourceAnchorRepository,
	TodoRepository
} from '$lib/server/repositories';
const now = (): DateTime => new Date().toISOString() as DateTime;

export class TodoCatalog {
	constructor(
		private readonly todos: TodoRepository,
		private readonly projects: ProjectRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository
	) {}

	async create(actor: ActorContext, input: CreateTodoInput): Promise<Todo> {
		const title = input.title.trim();
		if (!title) throw new ValidationError('Todo title is required');
		if (!(await this.projects.findById(actor, input.projectId)))
			throw new NotFoundError('Todo project was not found');
		if (input.sourceAnchorId)
			await this.validateAnchor(actor, input.sourceAnchorId, input.projectId);
		if (input.provenanceId && !(await this.provenance.findById(actor, input.provenanceId)))
			throw new NotFoundError('Todo provenance was not found');
		const timestamp = now();
		return this.todos.insert(actor, {
			id: crypto.randomUUID() as TodoId,
			userId: actor.userId,
			projectId: input.projectId,
			title,
			...(input.description !== undefined ? { description: input.description } : {}),
			status: 'open',
			responsibility: input.responsibility,
			...(input.waitingOn?.trim() ? { waitingOn: input.waitingOn.trim() } : {}),
			...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
			...(input.dueDateVerbatim !== undefined ? { dueDateVerbatim: input.dueDateVerbatim } : {}),
			...(input.promiseStrength !== undefined ? { promiseStrength: input.promiseStrength } : {}),
			...(input.sourceAnchorId !== undefined ? { sourceAnchorId: input.sourceAnchorId } : {}),
			...(input.provenanceId !== undefined ? { provenanceId: input.provenanceId } : {}),
			createdAt: timestamp,
			updatedAt: timestamp
		});
	}

	async get(actor: ActorContext, todoId: TodoId): Promise<Todo> {
		const todo = await this.todos.findById(actor, todoId);
		if (!todo) throw new NotFoundError('Todo was not found', { todoId });
		return todo;
	}

	async update(actor: ActorContext, todo: Todo): Promise<Todo> {
		if (todo.userId !== actor.userId) throw new OwnershipError('Cannot update another user’s todo');
		const current = await this.get(actor, todo.id);
		if (todo.projectId !== current.projectId)
			throw new ValidationError('A todo cannot move between projects during an edit');
		const title = todo.title.trim();
		if (!title) throw new ValidationError('Todo title is required');
		if (todo.linkedNoteId) await this.validateLinkedNote(actor, todo.linkedNoteId, todo.projectId);
		if (todo.sourceAnchorId) await this.validateAnchor(actor, todo.sourceAnchorId, todo.projectId);
		if (todo.provenanceId && !(await this.provenance.findById(actor, todo.provenanceId)))
			throw new NotFoundError('Todo provenance was not found');
		return this.todos.update(actor, {
			...todo,
			title,
			waitingOn: todo.responsibility === 'mine' ? undefined : todo.waitingOn?.trim() || undefined,
			updatedAt: now()
		});
	}

	async change(actor: ActorContext, todoId: TodoId, status: TodoStatus): Promise<Todo> {
		const todo = await this.get(actor, todoId);
		const { completedAt: _completedAt, ...withoutCompletion } = todo;
		void _completedAt;
		return this.todos.update(actor, {
			...withoutCompletion,
			status,
			...(status === 'done' ? { completedAt: now() } : {}),
			updatedAt: now()
		});
	}

	async softDelete(actor: ActorContext, todoId: TodoId): Promise<void> {
		await this.get(actor, todoId);
		await this.todos.softDelete(actor, todoId, now());
	}

	list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]> {
		return this.todos.list(actor, filter);
	}
	count(actor: ActorContext, filter: TodoListFilter): Promise<number> {
		return this.todos.count(actor, filter);
	}
	findDue(actor: ActorContext, through: string): Promise<readonly Todo[]> {
		return this.list(actor, { dueBefore: through as TodoListFilter['dueBefore'] });
	}
	findWaitingOn(actor: ActorContext): Promise<readonly Todo[]> {
		return this.list(actor, { responsibility: 'waiting_on' });
	}

	async assemble(actor: ActorContext, todos: readonly Todo[]): Promise<readonly TodoView[]> {
		return Promise.all(
			todos.map(async (todo) => {
				const anchor = todo.sourceAnchorId
					? await this.anchors.findById(actor, todo.sourceAnchorId)
					: undefined;
				const origin = anchor ? await this.notes.findById(actor, anchor.noteId) : undefined;
				const linked = todo.linkedNoteId
					? await this.notes.findById(actor, todo.linkedNoteId)
					: undefined;
				const source = linked ?? origin;
				const provenance = todo.provenanceId
					? await this.provenance.findById(actor, todo.provenanceId)
					: undefined;
				return {
					todo,
					...(source ? { sourceNote: { id: source.id, title: source.title } } : {}),
					...(origin ? { originNote: { id: origin.id, title: origin.title } } : {}),
					...(anchor ? { anchor } : {}),
					...(provenance ? { provenance } : {})
				};
			})
		);
	}

	private async validateLinkedNote(
		actor: ActorContext,
		noteId: NonNullable<Todo['linkedNoteId']>,
		projectId: Todo['projectId']
	): Promise<void> {
		const note = await this.notes.findById(actor, noteId);
		if (!note || note.projectId !== projectId || note.kind !== 'note' || note.archivedAt)
			throw new NotFoundError('Todo linked note was not found');
	}

	private async validateAnchor(
		actor: ActorContext,
		anchorId: NonNullable<CreateTodoInput['sourceAnchorId']>,
		projectId: CreateTodoInput['projectId']
	): Promise<void> {
		const anchor = await this.anchors.findById(actor, anchorId);
		const note = anchor ? await this.notes.findById(actor, anchor.noteId) : undefined;
		if (!anchor || !note || note.projectId !== projectId)
			throw new NotFoundError('Todo source anchor was not found');
	}
}

export type TodoCreator = Pick<TodoCatalog, 'create'>;
export type TodoDeleter = Pick<TodoCatalog, 'softDelete'>;
export type TodoReader = Pick<TodoCatalog, 'get'>;
export type TodoEditor = Pick<TodoCatalog, 'update'>;
export type TodoStatusChanger = Pick<TodoCatalog, 'change'>;
export type TodoLister = Pick<TodoCatalog, 'list' | 'count'>;
export type DueTodoFinder = Pick<TodoCatalog, 'findDue'>;
export type WaitingOnFinder = Pick<TodoCatalog, 'findWaitingOn'>;
export type TodoViewAssembler = Pick<TodoCatalog, 'assemble'>;

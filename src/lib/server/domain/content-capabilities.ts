import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import type {
	ActorContext,
	CreateNoteInput,
	CreateTodoInput,
	Note,
	NoteId,
	NoteSummary,
	ProjectId,
	SourceAnchor,
	TextSelection,
	Todo,
	TodoId,
	TodoListFilter,
	TodoStatus,
	TodoView,
	User
} from '$lib/models';
import { NotFoundError, OwnershipError, StaleRevisionError, ValidationError } from '$lib/models';
import type {
	DueTodoFinder,
	NoteCreator,
	NoteEditor,
	NoteIndexer,
	NoteReader,
	NoteRevisionRecorder,
	NoteTreeReader,
	SelectionAnchorCreator,
	SourceAnchorRepairer,
	TodoCreator,
	TodoDeleter,
	TodoEditor,
	TodoLister,
	TodoReader,
	TodoStatusChanger,
	TodoViewAssembler,
	UserReader,
	WaitingOnFinder
} from '$lib/services';
import type { Database } from '$lib/server/db';
import type { ProjectRepository } from '$lib/repositories';
import * as schema from '$lib/server/db/schema';
import { toAnchor, toNote, toProvenance, toTodo, toUser } from './mappers';
import { ensureProjectForActor } from './project-resolution';

async function ensureUser(database: Database, actor: ActorContext): Promise<User> {
	await database
		.insert(schema.users)
		.values({ id: actor.userId, email: `${actor.userId}@local.invalid`, displayName: 'Architect' })
		.onConflictDoNothing();
	const [row] = await database.select().from(schema.users).where(eq(schema.users.id, actor.userId));
	if (!row) throw new NotFoundError('User was not found');
	return toUser(row);
}

export class PostgresUserReader implements UserReader {
	constructor(private readonly database: Database) {}

	get(actor: ActorContext): Promise<User> {
		return ensureUser(this.database, actor);
	}
}

export class PostgresNoteCapabilities
	implements
		NoteCreator,
		NoteReader,
		NoteTreeReader,
		NoteEditor,
		NoteRevisionRecorder,
		SelectionAnchorCreator,
		SourceAnchorRepairer,
		NoteIndexer
{
	constructor(
		private readonly database: Database,
		private readonly projects: ProjectRepository
	) {}

	async get(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const [row] = await this.database
			.select()
			.from(schema.notes)
			.where(and(eq(schema.notes.id, noteId), eq(schema.notes.userId, actor.userId)));
		if (!row) throw new NotFoundError('Note was not found', { noteId });
		return toNote(row);
	}

	async list(actor: ActorContext, projectId?: ProjectId): Promise<readonly NoteSummary[]> {
		const conditions = [eq(schema.notes.userId, actor.userId), isNull(schema.notes.archivedAt)];
		if (projectId) conditions.push(eq(schema.notes.projectId, projectId));
		const rows = await this.database
			.select()
			.from(schema.notes)
			.where(and(...conditions))
			.orderBy(asc(schema.notes.position), asc(schema.notes.createdAt));
		return rows.map(toNote);
	}

	async save(actor: ActorContext, note: Note): Promise<Note> {
		if (note.userId !== actor.userId) throw new OwnershipError('Cannot save another user’s note');
		const current = await this.get(actor, note.id);
		if (!note.title.trim()) throw new ValidationError('Note title is required');
		if (current.archivedAt) throw new ValidationError('Archived notes cannot be edited');
		if (note.projectId !== current.projectId || note.kind !== current.kind)
			throw new ValidationError('A save cannot move a note between projects or change its kind');
		if (note.kind === 'folder' && (note.plainText.trim() || note.document.content?.length))
			throw new ValidationError('Folders cannot contain authored document content');
		if (note.parentId) await this.validateParent(actor, current, note.parentId);
		if (note.currentRevision !== current.currentRevision)
			throw new StaleRevisionError('The note has changed since it was loaded');
		if (
			note.title === current.title &&
			note.plainText === current.plainText &&
			JSON.stringify(note.document) === JSON.stringify(current.document) &&
			note.parentId === current.parentId &&
			note.position === current.position &&
			note.isPinned === current.isPinned
		)
			return current;
		const [row] = await this.database
			.update(schema.notes)
			.set({
				title: note.title.trim(),
				document: note.document as unknown as Record<string, unknown>,
				plainText: note.plainText,
				parentId: note.parentId,
				position: note.position,
				isPinned: note.isPinned,
				currentRevision: current.currentRevision + 1
			})
			.where(and(eq(schema.notes.id, note.id), eq(schema.notes.userId, actor.userId)))
			.returning();
		return toNote(row!);
	}

	async record(actor: ActorContext, note: Note): Promise<void> {
		await this.get(actor, note.id);
		await this.database
			.insert(schema.noteRevisions)
			.values({
				noteId: note.id,
				revision: note.currentRevision,
				title: note.title,
				document: note.document as unknown as Record<string, unknown>,
				plainText: note.plainText
			})
			.onConflictDoNothing();
	}

	async createAnchor(actor: ActorContext, selection: TextSelection): Promise<SourceAnchor> {
		if (!selection.text.trim()) throw new ValidationError('A non-empty selection is required');
		const note = await this.get(actor, selection.noteId);
		if (selection.revision !== note.currentRevision)
			throw new StaleRevisionError('The selected note revision is stale');
		if (
			!Number.isInteger(selection.from) ||
			!Number.isInteger(selection.to) ||
			selection.from < 0 ||
			selection.from > selection.to ||
			selection.to > note.plainText.length
		)
			throw new ValidationError('Selection offsets are outside the note');
		const [row] = await this.database
			.insert(schema.sourceAnchors)
			.values({
				noteId: selection.noteId,
				fromOffset: selection.from,
				toOffset: selection.to,
				quote: selection.text,
				revision: selection.revision
			})
			.returning();
		return toAnchor(row!);
	}

	create(actor: ActorContext, selection: TextSelection): Promise<SourceAnchor>;
	create(actor: ActorContext, input: CreateNoteInput): Promise<Note>;
	create(
		actor: ActorContext,
		input: TextSelection | CreateNoteInput
	): Promise<SourceAnchor | Note> {
		return 'text' in input ? this.createAnchor(actor, input) : this.createNote(actor, input);
	}

	private async createNote(actor: ActorContext, input: CreateNoteInput): Promise<Note> {
		const title = input.title.trim();
		if (!title) throw new ValidationError('Note title is required');
		const project = await ensureProjectForActor(this.projects, actor, input.projectId);
		if (input.parentId) {
			const parent = await this.get(actor, input.parentId);
			if (parent.projectId !== project.id) throw new NotFoundError('Parent folder was not found');
			if (parent.kind !== 'folder') throw new ValidationError('A parent must be a folder');
		}
		const siblings = await this.database
			.select({ id: schema.notes.id })
			.from(schema.notes)
			.where(
				and(
					eq(schema.notes.userId, actor.userId),
					eq(schema.notes.projectId, project.id),
					input.parentId ? eq(schema.notes.parentId, input.parentId) : isNull(schema.notes.parentId)
				)
			);
		const [row] = await this.database
			.insert(schema.notes)
			.values({
				userId: actor.userId,
				projectId: project.id,
				title,
				parentId: input.parentId,
				position: siblings.length
			})
			.returning();
		return toNote(row!);
	}

	async repairForNote(actor: ActorContext, note: Note): Promise<readonly SourceAnchor[]> {
		await this.get(actor, note.id);
		const rows = await this.database
			.select()
			.from(schema.sourceAnchors)
			.where(eq(schema.sourceAnchors.noteId, note.id));
		const repaired: SourceAnchor[] = [];
		for (const row of rows) {
			const first = note.plainText.indexOf(row.quote);
			if (first < 0 || first !== note.plainText.lastIndexOf(row.quote)) continue;
			const [updated] = await this.database
				.update(schema.sourceAnchors)
				.set({
					fromOffset: first,
					toOffset: first + row.quote.length,
					revision: note.currentRevision
				})
				.where(eq(schema.sourceAnchors.id, row.id))
				.returning();
			repaired.push(toAnchor(updated!));
		}
		return repaired;
	}

	async index(actor: ActorContext, note: Note): Promise<void> {
		await this.get(actor, note.id);
		await this.database.delete(schema.searchChunks).where(eq(schema.searchChunks.noteId, note.id));
		if (!note.plainText.trim()) return;
		await this.database.insert(schema.searchChunks).values({
			id: crypto.randomUUID(),
			userId: actor.userId,
			projectId: note.projectId,
			noteId: note.id,
			content: note.plainText,
			contentHash: `${note.plainText.length}:${note.currentRevision}`
		});
	}

	private async validateParent(actor: ActorContext, note: Note, parentId: NoteId): Promise<void> {
		if (parentId === note.id) throw new ValidationError('A note cannot parent itself');
		let cursor: Note | undefined = await this.get(actor, parentId);
		if (cursor.projectId !== note.projectId) throw new NotFoundError('Parent folder was not found');
		if (cursor.kind !== 'folder') throw new ValidationError('A parent must be a folder');
		while (cursor.parentId) {
			if (cursor.parentId === note.id)
				throw new ValidationError('A note cannot move below its descendant');
			cursor = await this.get(actor, cursor.parentId);
		}
	}
}

export class PostgresTodoCapabilities
	implements
		TodoCreator,
		TodoDeleter,
		TodoReader,
		TodoEditor,
		TodoStatusChanger,
		TodoLister,
		DueTodoFinder,
		WaitingOnFinder,
		TodoViewAssembler
{
	constructor(
		private readonly database: Database,
		private readonly projects: ProjectRepository
	) {}

	async create(actor: ActorContext, input: CreateTodoInput): Promise<Todo> {
		if (!input.title.trim()) throw new ValidationError('Todo title is required');
		const project = await ensureProjectForActor(this.projects, actor, input.projectId);
		if (input.sourceAnchorId) {
			const [anchorNote] = await this.database
				.select({ userId: schema.notes.userId, projectId: schema.notes.projectId })
				.from(schema.sourceAnchors)
				.innerJoin(schema.notes, eq(schema.notes.id, schema.sourceAnchors.noteId))
				.where(eq(schema.sourceAnchors.id, input.sourceAnchorId));
			if (!anchorNote || anchorNote.userId !== actor.userId || anchorNote.projectId !== project.id)
				throw new NotFoundError('Todo source anchor was not found');
		}
		if (input.provenanceId) {
			const [ownedProvenance] = await this.database
				.select({ id: schema.provenance.id })
				.from(schema.provenance)
				.where(
					and(
						eq(schema.provenance.id, input.provenanceId),
						eq(schema.provenance.userId, actor.userId)
					)
				);
			if (!ownedProvenance) throw new NotFoundError('Todo provenance was not found');
		}
		const { projectId: _projectId, ...values } = input;
		void _projectId;
		const [row] = await this.database
			.insert(schema.todos)
			.values({ userId: actor.userId, projectId: project.id, ...values })
			.returning();
		return toTodo(row!);
	}

	async get(actor: ActorContext, todoId: TodoId): Promise<Todo> {
		const [row] = await this.database
			.select()
			.from(schema.todos)
			.where(and(eq(schema.todos.id, todoId), eq(schema.todos.userId, actor.userId)));
		if (!row) throw new NotFoundError('Todo was not found', { todoId });
		return toTodo(row);
	}

	async softDelete(actor: ActorContext, todoId: TodoId): Promise<void> {
		const [row] = await this.database
			.update(schema.todos)
			.set({ deletedAt: new Date() })
			.where(and(eq(schema.todos.id, todoId), eq(schema.todos.userId, actor.userId)))
			.returning({ id: schema.todos.id });
		if (!row) throw new NotFoundError('Todo was not found');
	}

	async update(actor: ActorContext, todo: Todo): Promise<Todo> {
		if (todo.userId !== actor.userId) throw new OwnershipError('Cannot update another user’s todo');
		if (!todo.title.trim()) throw new ValidationError('Todo title is required');
		const current = await this.get(actor, todo.id);
		if (todo.projectId !== current.projectId)
			throw new ValidationError('A todo cannot move between projects during an edit');
		const [row] = await this.database
			.update(schema.todos)
			.set({ title: todo.title, description: todo.description, dueDate: todo.dueDate })
			.where(and(eq(schema.todos.id, todo.id), eq(schema.todos.userId, actor.userId)))
			.returning();
		if (!row) throw new NotFoundError('Todo was not found');
		return toTodo(row);
	}

	async change(actor: ActorContext, todoId: TodoId, status: TodoStatus): Promise<Todo> {
		const [row] = await this.database
			.update(schema.todos)
			.set({
				status,
				completedAt: status === 'done' ? new Date() : null
			})
			.where(and(eq(schema.todos.id, todoId), eq(schema.todos.userId, actor.userId)))
			.returning();
		if (!row) throw new NotFoundError('Todo was not found');
		return toTodo(row);
	}

	async list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]> {
		const conditions = [eq(schema.todos.userId, actor.userId), isNull(schema.todos.deletedAt)];
		if (filter.projectId) conditions.push(eq(schema.todos.projectId, filter.projectId));
		if (filter.status) conditions.push(eq(schema.todos.status, filter.status));
		if (filter.responsibility)
			conditions.push(eq(schema.todos.responsibility, filter.responsibility));
		if (filter.dueBefore) conditions.push(lte(schema.todos.dueDate, filter.dueBefore));
		if (filter.noteId) {
			const anchorRows = await this.database
				.select({ id: schema.sourceAnchors.id })
				.from(schema.sourceAnchors)
				.where(eq(schema.sourceAnchors.noteId, filter.noteId));
			if (!anchorRows.length) return [];
			conditions.push(
				inArray(
					schema.todos.sourceAnchorId,
					anchorRows.map((row) => row.id)
				)
			);
		}
		const rows = await this.database
			.select()
			.from(schema.todos)
			.where(and(...conditions))
			.orderBy(asc(schema.todos.dueDate), desc(schema.todos.updatedAt));
		return Promise.all(rows.map((row) => this.get(actor, row.id as TodoId)));
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
				const anchorRow = todo.sourceAnchorId
					? (
							await this.database
								.select()
								.from(schema.sourceAnchors)
								.where(eq(schema.sourceAnchors.id, todo.sourceAnchorId))
						)[0]
					: undefined;
				const noteRow = anchorRow
					? (
							await this.database
								.select()
								.from(schema.notes)
								.where(
									and(eq(schema.notes.id, anchorRow.noteId), eq(schema.notes.userId, actor.userId))
								)
						)[0]
					: undefined;
				const provenanceRow = todo.provenanceId
					? (
							await this.database
								.select()
								.from(schema.provenance)
								.where(eq(schema.provenance.id, todo.provenanceId))
						)[0]
					: undefined;
				return {
					todo,
					...(noteRow ? { sourceNote: { id: noteRow.id as NoteId, title: noteRow.title } } : {}),
					...(anchorRow ? { anchor: toAnchor(anchorRow) } : {}),
					...(provenanceRow ? { provenance: toProvenance(provenanceRow) } : {})
				};
			})
		);
	}
}

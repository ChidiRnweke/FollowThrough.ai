import { and, asc, count, desc, eq, inArray, isNull, lte, type SQL } from 'drizzle-orm';
import type { ActorContext, Todo, TodoId, TodoListFilter } from '$lib/models';
import { NotFoundError } from '$lib/errors';
import type { TodoRepository } from '$lib/server/repositories/todos';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toTodo } from '$lib/server/db/mappers';

export class TodoRecords implements TodoRepository {
	constructor(private readonly database: Database) {}

	async findById(actor: ActorContext, id: TodoId): Promise<Todo | undefined> {
		const [row] = await this.database
			.select({ todo: schema.todos })
			.from(schema.todos)
			.innerJoin(schema.projects, eq(schema.projects.id, schema.todos.projectId))
			.where(
				and(
					eq(schema.todos.id, id),
					eq(schema.todos.userId, actor.userId),
					isNull(schema.projects.archivedAt)
				)
			);
		return row ? toTodo(row.todo) : undefined;
	}

	/**
	 * Shared predicate for `list` and `count`. Returns undefined when the filter
	 * cannot match anything — a note with no source anchors — so callers skip the
	 * second query entirely.
	 */
	private async conditionsFor(
		actor: ActorContext,
		filter: TodoListFilter
	): Promise<SQL[] | undefined> {
		const conditions = [
			eq(schema.todos.userId, actor.userId),
			isNull(schema.todos.deletedAt),
			isNull(schema.projects.archivedAt)
		];
		if (filter.projectId) conditions.push(eq(schema.todos.projectId, filter.projectId));
		if (filter.status) conditions.push(eq(schema.todos.status, filter.status));
		if (filter.responsibility)
			conditions.push(eq(schema.todos.responsibility, filter.responsibility));
		if (filter.dueBefore) conditions.push(lte(schema.todos.dueDate, filter.dueBefore));
		if (filter.noteId) {
			const anchors = await this.database
				.select({ id: schema.sourceAnchors.id })
				.from(schema.sourceAnchors)
				.innerJoin(schema.notes, eq(schema.notes.id, schema.sourceAnchors.noteId))
				.where(
					and(eq(schema.sourceAnchors.noteId, filter.noteId), eq(schema.notes.userId, actor.userId))
				);
			if (anchors.length === 0) return undefined;
			conditions.push(
				inArray(
					schema.todos.sourceAnchorId,
					anchors.map((anchor) => anchor.id)
				)
			);
		}
		return conditions;
	}

	async list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]> {
		const conditions = await this.conditionsFor(actor, filter);
		if (!conditions) return [];
		return (
			await this.database
				.select({ todo: schema.todos })
				.from(schema.todos)
				.innerJoin(schema.projects, eq(schema.projects.id, schema.todos.projectId))
				.where(and(...conditions))
				.orderBy(asc(schema.todos.dueDate), desc(schema.todos.updatedAt))
		).map((row) => toTodo(row.todo));
	}

	async count(actor: ActorContext, filter: TodoListFilter): Promise<number> {
		const conditions = await this.conditionsFor(actor, filter);
		if (!conditions) return 0;
		const [row] = await this.database
			.select({ total: count() })
			.from(schema.todos)
			.innerJoin(schema.projects, eq(schema.projects.id, schema.todos.projectId))
			.where(and(...conditions));
		return row?.total ?? 0;
	}

	async insert(actor: ActorContext, todo: Todo): Promise<Todo> {
		const [row] = await this.database
			.insert(schema.todos)
			.values({
				id: todo.id,
				userId: actor.userId,
				projectId: todo.projectId,
				title: todo.title,
				description: todo.description,
				status: todo.status,
				responsibility: todo.responsibility,
				priority: todo.priority,
				waitingOn: todo.waitingOn,
				dueDate: todo.dueDate,
				dueDateVerbatim: todo.dueDateVerbatim,
				promiseStrength: todo.promiseStrength,
				sourceAnchorId: todo.sourceAnchorId,
				linkedNoteId: todo.linkedNoteId,
				provenanceId: todo.provenanceId,
				completedAt: todo.completedAt ? new Date(todo.completedAt) : undefined,
				deletedAt: todo.deletedAt ? new Date(todo.deletedAt) : undefined,
				createdAt: new Date(todo.createdAt),
				updatedAt: new Date(todo.updatedAt)
			})
			.returning();
		return toTodo(row!);
	}

	async update(actor: ActorContext, todo: Todo): Promise<Todo> {
		const [row] = await this.database
			.update(schema.todos)
			.set({
				title: todo.title,
				description: todo.description,
				status: todo.status,
				responsibility: todo.responsibility,
				priority: todo.priority ?? null,
				waitingOn: todo.waitingOn,
				dueDate: todo.dueDate,
				dueDateVerbatim: todo.dueDateVerbatim,
				promiseStrength: todo.promiseStrength,
				sourceAnchorId: todo.sourceAnchorId,
				linkedNoteId: todo.linkedNoteId,
				provenanceId: todo.provenanceId,
				completedAt: todo.completedAt ? new Date(todo.completedAt) : null,
				deletedAt: todo.deletedAt ? new Date(todo.deletedAt) : null,
				updatedAt: new Date(todo.updatedAt)
			})
			.where(and(eq(schema.todos.id, todo.id), eq(schema.todos.userId, actor.userId)))
			.returning();
		if (!row) throw new NotFoundError('Todo was not found');
		return toTodo(row);
	}

	async softDelete(actor: ActorContext, id: TodoId, deletedAt: Todo['deletedAt']): Promise<void> {
		const [row] = await this.database
			.update(schema.todos)
			.set({ deletedAt: deletedAt ? new Date(deletedAt) : new Date() })
			.where(and(eq(schema.todos.id, id), eq(schema.todos.userId, actor.userId)))
			.returning({ id: schema.todos.id });
		if (!row) throw new NotFoundError('Todo was not found');
	}
}

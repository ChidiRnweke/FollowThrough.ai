import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type {
	ActorContext,
	Note,
	NoteId,
	NoteRevision,
	ProjectId,
	SourceAnchor,
	SourceAnchorId
} from '$lib/models';
import type { NoteRepository, SourceAnchorRepository } from '$lib/repositories';
import { NotFoundError } from '$lib/models';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toAnchor, toNote, toRevision } from '../domain/mappers';

export class PostgresNoteRepository implements NoteRepository {
	constructor(private readonly database: Database) {}

	async findById(actor: ActorContext, id: NoteId): Promise<Note | undefined> {
		const [row] = await this.database
			.select({ note: schema.notes })
			.from(schema.notes)
			.innerJoin(schema.projects, eq(schema.projects.id, schema.notes.projectId))
			.where(
				and(
					eq(schema.notes.id, id),
					eq(schema.notes.userId, actor.userId),
					isNull(schema.projects.archivedAt)
				)
			);
		return row ? toNote(row.note) : undefined;
	}

	async listActive(actor: ActorContext, projectId?: ProjectId): Promise<readonly Note[]> {
		const conditions = [eq(schema.notes.userId, actor.userId), isNull(schema.notes.archivedAt)];
		if (projectId) conditions.push(eq(schema.notes.projectId, projectId));
		return (
			await this.database
				.select({ note: schema.notes })
				.from(schema.notes)
				.innerJoin(schema.projects, eq(schema.projects.id, schema.notes.projectId))
				.where(and(...conditions, isNull(schema.projects.archivedAt)))
				.orderBy(asc(schema.notes.position), asc(schema.notes.createdAt))
		).map((row) => toNote(row.note));
	}

	async countSiblings(
		actor: ActorContext,
		projectId: ProjectId,
		parentId?: NoteId
	): Promise<number> {
		const [row] = await this.database
			.select({ count: sql<number>`count(*)::int` })
			.from(schema.notes)
			.where(
				and(
					eq(schema.notes.userId, actor.userId),
					eq(schema.notes.projectId, projectId),
					parentId ? eq(schema.notes.parentId, parentId) : isNull(schema.notes.parentId)
				)
			);
		return row?.count ?? 0;
	}

	async insert(actor: ActorContext, note: Note): Promise<Note> {
		const [row] = await this.database
			.insert(schema.notes)
			.values({
				id: note.id,
				userId: actor.userId,
				projectId: note.projectId,
				parentId: note.parentId,
				kind: note.kind,
				position: note.position,
				title: note.title,
				builtInKey: note.builtInKey,
				document: note.document as unknown as Record<string, unknown>,
				plainText: note.plainText,
				currentRevision: note.currentRevision,
				isPinned: note.isPinned,
				archivedAt: note.archivedAt ? new Date(note.archivedAt) : undefined,
				createdAt: new Date(note.createdAt),
				updatedAt: new Date(note.updatedAt)
			})
			.returning();
		return toNote(row!);
	}

	async update(actor: ActorContext, note: Note): Promise<Note> {
		const [row] = await this.database
			.update(schema.notes)
			.set({
				kind: note.kind,
				title: note.title,
				document: note.document as unknown as Record<string, unknown>,
				plainText: note.plainText,
				parentId: note.parentId,
				position: note.position,
				isPinned: note.isPinned,
				currentRevision: note.currentRevision,
				archivedAt: note.archivedAt ? new Date(note.archivedAt) : null
			})
			.where(and(eq(schema.notes.id, note.id), eq(schema.notes.userId, actor.userId)))
			.returning();
		return toNote(row!);
	}

	async delete(actor: ActorContext, id: NoteId): Promise<void> {
		await this.database
			.delete(schema.notes)
			.where(and(eq(schema.notes.id, id), eq(schema.notes.userId, actor.userId)));
	}

	async insertRevision(actor: ActorContext, revision: NoteRevision): Promise<NoteRevision> {
		const note = await this.findById(actor, revision.noteId);
		if (!note) throw new NotFoundError('Note was not found');
		const [row] = await this.database
			.insert(schema.noteRevisions)
			.values({
				id: revision.id,
				noteId: revision.noteId,
				revision: revision.revision,
				title: revision.title,
				document: revision.document as unknown as Record<string, unknown>,
				plainText: revision.plainText,
				provenanceId: revision.provenanceId,
				createdAt: new Date(revision.createdAt)
			})
			.onConflictDoNothing()
			.returning();
		return row ? toRevision(row) : revision;
	}

	async listRevisions(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRevision[]> {
		if (!(await this.findById(actor, noteId))) return [];
		return (
			await this.database
				.select()
				.from(schema.noteRevisions)
				.where(eq(schema.noteRevisions.noteId, noteId))
				.orderBy(asc(schema.noteRevisions.revision))
		).map(toRevision);
	}
}

export class PostgresSourceAnchorRepository implements SourceAnchorRepository {
	constructor(private readonly database: Database) {}

	async findById(actor: ActorContext, id: SourceAnchorId): Promise<SourceAnchor | undefined> {
		const [row] = await this.database
			.select({ anchor: schema.sourceAnchors })
			.from(schema.sourceAnchors)
			.innerJoin(schema.notes, eq(schema.notes.id, schema.sourceAnchors.noteId))
			.where(and(eq(schema.sourceAnchors.id, id), eq(schema.notes.userId, actor.userId)));
		return row ? toAnchor(row.anchor) : undefined;
	}

	async listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly SourceAnchor[]> {
		return (
			await this.database
				.select({ anchor: schema.sourceAnchors })
				.from(schema.sourceAnchors)
				.innerJoin(schema.notes, eq(schema.notes.id, schema.sourceAnchors.noteId))
				.where(and(eq(schema.sourceAnchors.noteId, noteId), eq(schema.notes.userId, actor.userId)))
		).map((row) => toAnchor(row.anchor));
	}

	async insert(actor: ActorContext, anchor: SourceAnchor): Promise<SourceAnchor> {
		const [owned] = await this.database
			.select({ id: schema.notes.id })
			.from(schema.notes)
			.where(and(eq(schema.notes.id, anchor.noteId), eq(schema.notes.userId, actor.userId)));
		if (!owned) throw new NotFoundError('Note was not found');
		const [row] = await this.database
			.insert(schema.sourceAnchors)
			.values({
				id: anchor.id,
				noteId: anchor.noteId,
				nodeId: anchor.nodeId,
				fromOffset: anchor.from,
				toOffset: anchor.to,
				quote: anchor.quote,
				prefix: anchor.prefix,
				suffix: anchor.suffix,
				revision: anchor.revision,
				createdAt: new Date(anchor.createdAt)
			})
			.returning();
		return toAnchor(row!);
	}

	async update(actor: ActorContext, anchor: SourceAnchor): Promise<SourceAnchor> {
		if (!(await this.findById(actor, anchor.id))) throw new NotFoundError('Anchor was not found');
		const [row] = await this.database
			.update(schema.sourceAnchors)
			.set({
				nodeId: anchor.nodeId,
				fromOffset: anchor.from,
				toOffset: anchor.to,
				quote: anchor.quote,
				prefix: anchor.prefix,
				suffix: anchor.suffix,
				revision: anchor.revision
			})
			.where(eq(schema.sourceAnchors.id, anchor.id))
			.returning();
		return toAnchor(row!);
	}
}

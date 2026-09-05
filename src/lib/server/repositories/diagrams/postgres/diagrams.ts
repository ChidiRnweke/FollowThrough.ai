import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type {
	Diagram,
	DiagramId,
	DiagramRevision,
	DiagramRevisionId,
	DrawioDiagram
} from '$lib/models/diagrams';
import type { ListProjectDiagramsOutput, ListProjectDiagramsParams } from '$lib/models/diagrams';
import type { ConversationId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { NotFoundError } from '$lib/errors';
import type { DiagramRepository } from '$lib/server/repositories/diagrams/diagrams';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/diagrams';
import { toDiagram, toDiagramRevision } from '$lib/server/db/mappers';

export class DiagramRecords implements DiagramRepository {
	constructor(private readonly database: Database) {}
	async findById(actor: ActorContext, id: DiagramId): Promise<Diagram | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.diagrams)
			.where(and(eq(schema.diagrams.id, id), eq(schema.diagrams.userId, actor.userId)));
		return row ? toDiagram(row) : undefined;
	}
	async findByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<Diagram | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.diagrams)
			.where(
				and(
					eq(schema.diagrams.conversationId, conversationId),
					eq(schema.diagrams.userId, actor.userId),
					// A conversation whose diagram is in the trash has none as far as the
					// studio is concerned: refusing a new one by naming a diagram the user
					// threw away would be worse than the guess it replaced.
					isNull(schema.diagrams.archivedAt)
				)
			);
		return row ? toDiagram(row) : undefined;
	}
	async countReferencingNotes(actor: ActorContext, id: DiagramId): Promise<number> {
		// A draw.io reference is a `drawio` node inside the note's ProseMirror
		// document, so the documents are the only place this can be counted. The
		// scan is bounded to the actor's notes and only runs behind a delete
		// confirmation, never on a write path.
		const [row] = await this.database
			.select({ total: sql<number>`count(*)::int` })
			.from(schema.notes)
			.where(
				and(
					eq(schema.notes.userId, actor.userId),
					sql`jsonb_path_exists(${schema.notes.document}, '$.** ? (@.type == "drawio" && @.attrs.diagramId == $id)', jsonb_build_object('id', ${id}::text))`
				)
			);
		return row?.total ?? 0;
	}
	async listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]> {
		return (
			await this.database
				.select()
				.from(schema.diagrams)
				.where(
					and(
						eq(schema.diagrams.userId, actor.userId),
						eq(schema.diagrams.sourceNoteId, noteId),
						// A note renders a trashed diagram as unavailable, which is what the
						// gallery's own confirmation promises before it moves one.
						isNull(schema.diagrams.archivedAt)
					)
				)
				.orderBy(asc(schema.diagrams.createdAt))
		).map(toDiagram);
	}
	private projectFilters(
		actor: ActorContext,
		projectId: ProjectId,
		params: ListProjectDiagramsParams
	) {
		const term = params.query?.trim();
		// Titles and the searchable text, so a query finds a diagram by what it is
		// called or by a label inside it — the two things a reader remembers.
		const search = term
			? or(
					ilike(schema.diagrams.title, `%${term}%`),
					ilike(schema.diagrams.searchableText, `%${term}%`)
				)
			: undefined;
		return and(
			eq(schema.diagrams.projectId, projectId),
			eq(schema.diagrams.userId, actor.userId),
			// The gallery and its count both build from here, so one filter keeps the
			// number and the grid telling the same story about what is in the project.
			isNull(schema.diagrams.archivedAt),
			params.kind ? eq(schema.diagrams.kind, params.kind) : undefined,
			search
		);
	}

	async countForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params: ListProjectDiagramsParams = {}
	): Promise<number> {
		const [totals] = await this.database
			.select({ total: count() })
			.from(schema.diagrams)
			.where(this.projectFilters(actor, projectId, params));
		return totals?.total ?? 0;
	}

	async listForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params: ListProjectDiagramsParams = {}
	): Promise<ListProjectDiagramsOutput> {
		const filters = this.projectFilters(actor, projectId, params);
		let rows = this.database
			.select()
			.from(schema.diagrams)
			.where(filters)
			.orderBy(desc(schema.diagrams.createdAt))
			.$dynamic();
		if (params.limit !== undefined) rows = rows.limit(params.limit);
		if (params.offset !== undefined) rows = rows.offset(params.offset);
		// Together: the page and its total share only the filter, so awaiting one
		// before building the other cost a round trip on every gallery view.
		const [totals, page] = await Promise.all([
			this.database.select({ total: count() }).from(schema.diagrams).where(filters),
			rows
		]);
		return { diagrams: page.map(toDiagram), total: totals[0]?.total ?? 0 };
	}
	async insert(actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		// A diagram carries its own project. When it also names a source note, that
		// note must exist and belong to the actor — a studio diagram has no note and
		// skips the lookup entirely.
		if (diagram.sourceNoteId !== undefined) {
			const [note] = await this.database
				.select({ id: schema.notes.id })
				.from(schema.notes)
				.where(
					and(eq(schema.notes.id, diagram.sourceNoteId), eq(schema.notes.userId, actor.userId))
				);
			if (!note) throw new NotFoundError('Diagram note was not found');
		}
		const [row] = await this.database
			.insert(schema.diagrams)
			.values({
				id: diagram.id,
				userId: actor.userId,
				projectId: diagram.projectId,
				sourceNoteId: diagram.sourceNoteId,
				conversationId: diagram.conversationId,
				kind: diagram.kind,
				title: diagram.title,
				source: diagram.source,
				renderedSvg: diagram.renderedSvg,
				searchableText: diagram.searchableText,
				currentRevision: diagram.kind === 'drawio' ? diagram.currentRevision : 1,
				publishedRevision: diagram.kind === 'drawio' ? diagram.publishedRevision : 1,
				publishedAt:
					diagram.kind === 'drawio' && diagram.publishedAt
						? new Date(diagram.publishedAt)
						: undefined,
				promotedFromId: diagram.kind === 'drawio' ? diagram.promotedFromId : undefined,
				sourceAnchorId: diagram.sourceAnchorId,
				provenanceId: diagram.provenanceId,
				createdAt: new Date(diagram.createdAt),
				updatedAt: new Date(diagram.updatedAt)
			})
			.returning();
		return toDiagram(row!);
	}
	async update(actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		const [row] = await this.database
			.update(schema.diagrams)
			.set({
				title: diagram.title,
				source: diagram.source,
				renderedSvg: diagram.renderedSvg,
				searchableText: diagram.searchableText,
				...(diagram.kind === 'drawio'
					? {
							currentRevision: diagram.currentRevision,
							publishedRevision: diagram.publishedRevision,
							publishedAt: diagram.publishedAt ? new Date(diagram.publishedAt) : null
						}
					: {}),
				updatedAt: new Date(diagram.updatedAt)
			})
			.where(and(eq(schema.diagrams.id, diagram.id), eq(schema.diagrams.userId, actor.userId)))
			.returning();
		if (!row) throw new NotFoundError('Diagram was not found');
		return toDiagram(row);
	}
	async updateIfRevision(
		actor: ActorContext,
		diagram: DrawioDiagram,
		expected: number,
		expectedPublishedRevision: number
	) {
		const [row] = await this.database
			.update(schema.diagrams)
			.set({
				title: diagram.title,
				source: diagram.source,
				renderedSvg: diagram.renderedSvg,
				searchableText: diagram.searchableText,
				currentRevision: diagram.currentRevision,
				publishedRevision: diagram.publishedRevision,
				publishedAt: diagram.publishedAt ? new Date(diagram.publishedAt) : null,
				updatedAt: new Date(diagram.updatedAt)
			})
			.where(
				and(
					eq(schema.diagrams.id, diagram.id),
					eq(schema.diagrams.userId, actor.userId),
					eq(schema.diagrams.currentRevision, expected),
					eq(schema.diagrams.publishedRevision, expectedPublishedRevision),
					isNull(schema.diagrams.archivedAt)
				)
			)
			.returning();
		if (!row) return undefined;
		const updated = toDiagram(row);
		return updated.kind === 'drawio' ? updated : undefined;
	}
	async insertRevision(actor: ActorContext, revision: DiagramRevision) {
		const owned = await this.findById(actor, revision.diagramId);
		if (!owned) throw new NotFoundError('Diagram was not found');
		const [row] = await this.database
			.insert(schema.diagramRevisions)
			.values({
				id: revision.id,
				diagramId: revision.diagramId,
				revision: revision.revision,
				title: revision.title,
				source: revision.source,
				renderedSvg: revision.renderedSvg,
				searchableText: revision.searchableText,
				createdAt: new Date(revision.createdAt)
			})
			.onConflictDoNothing({
				target: [schema.diagramRevisions.diagramId, schema.diagramRevisions.revision]
			})
			.returning();
		if (row) return toDiagramRevision(row);
		const [existing] = await this.database
			.select()
			.from(schema.diagramRevisions)
			.where(
				and(
					eq(schema.diagramRevisions.diagramId, revision.diagramId),
					eq(schema.diagramRevisions.revision, revision.revision)
				)
			);
		if (!existing) throw new NotFoundError('The published diagram snapshot was not found');
		return toDiagramRevision(existing);
	}
	async listRevisions(actor: ActorContext, id: DiagramId) {
		if (!(await this.findById(actor, id))) throw new NotFoundError('Diagram was not found');
		return (
			await this.database
				.select()
				.from(schema.diagramRevisions)
				.where(eq(schema.diagramRevisions.diagramId, id))
				.orderBy(desc(schema.diagramRevisions.createdAt))
		).map(toDiagramRevision);
	}
	async findRevision(actor: ActorContext, id: DiagramId, revisionId: DiagramRevisionId) {
		if (!(await this.findById(actor, id))) throw new NotFoundError('Diagram was not found');
		const [row] = await this.database
			.select()
			.from(schema.diagramRevisions)
			.where(
				and(eq(schema.diagramRevisions.diagramId, id), eq(schema.diagramRevisions.id, revisionId))
			);
		return row ? toDiagramRevision(row) : undefined;
	}
	async setArchived(actor: ActorContext, id: DiagramId, archived: boolean): Promise<Diagram> {
		const [row] = await this.database
			.update(schema.diagrams)
			.set({ archivedAt: archived ? new Date() : null })
			.where(and(eq(schema.diagrams.id, id), eq(schema.diagrams.userId, actor.userId)))
			.returning();
		if (!row) throw new NotFoundError('Diagram was not found', { diagramId: id });
		return toDiagram(row);
	}

	async listArchived(actor: ActorContext, projectId?: ProjectId): Promise<readonly Diagram[]> {
		const scope = projectId
			? and(eq(schema.diagrams.userId, actor.userId), eq(schema.diagrams.projectId, projectId))
			: eq(schema.diagrams.userId, actor.userId);
		return (
			await this.database
				.select()
				.from(schema.diagrams)
				.where(and(scope, isNotNull(schema.diagrams.archivedAt)))
				.orderBy(desc(schema.diagrams.archivedAt))
		).map(toDiagram);
	}

	async delete(actor: ActorContext, id: DiagramId): Promise<void> {
		const [row] = await this.database
			.delete(schema.diagrams)
			.where(and(eq(schema.diagrams.id, id), eq(schema.diagrams.userId, actor.userId)))
			.returning({ id: schema.diagrams.id });
		if (!row) throw new NotFoundError('Diagram was not found');
	}
}

import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { Diagram, DiagramId } from '$lib/models/diagrams';
import type { ListProjectDiagramsOutput, ListProjectDiagramsParams } from '$lib/models/diagrams';
import type { ConversationId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { NotFoundError } from '$lib/errors';
import type { DiagramRepository } from '$lib/server/repositories/diagrams/diagrams';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/diagrams';
import { toDiagram } from '$lib/server/db/mappers';

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
					eq(schema.diagrams.userId, actor.userId)
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
					and(eq(schema.diagrams.userId, actor.userId), eq(schema.diagrams.sourceNoteId, noteId))
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
				updatedAt: new Date(diagram.updatedAt)
			})
			.where(and(eq(schema.diagrams.id, diagram.id), eq(schema.diagrams.userId, actor.userId)))
			.returning();
		if (!row) throw new NotFoundError('Diagram was not found');
		return toDiagram(row);
	}
	async delete(actor: ActorContext, id: DiagramId): Promise<void> {
		const [row] = await this.database
			.delete(schema.diagrams)
			.where(and(eq(schema.diagrams.id, id), eq(schema.diagrams.userId, actor.userId)))
			.returning({ id: schema.diagrams.id });
		if (!row) throw new NotFoundError('Diagram was not found');
	}
}

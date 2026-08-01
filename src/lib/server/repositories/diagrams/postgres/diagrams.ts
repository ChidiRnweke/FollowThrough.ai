import { and, asc, eq } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { Diagram, DiagramId } from '$lib/models/diagrams';
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
	async listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]> {
		return (
			await this.database
				.select()
				.from(schema.diagrams)
				.where(and(eq(schema.diagrams.userId, actor.userId), eq(schema.diagrams.noteId, noteId)))
				.orderBy(asc(schema.diagrams.createdAt))
		).map(toDiagram);
	}
	async listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Diagram[]> {
		return (
			await this.database
				.select()
				.from(schema.diagrams)
				.where(
					and(eq(schema.diagrams.userId, actor.userId), eq(schema.diagrams.projectId, projectId))
				)
				.orderBy(asc(schema.diagrams.createdAt))
		).map(toDiagram);
	}
	async insert(actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		const [note] = await this.database
			.select({ projectId: schema.notes.projectId })
			.from(schema.notes)
			.where(and(eq(schema.notes.id, diagram.noteId), eq(schema.notes.userId, actor.userId)));
		if (!note) throw new NotFoundError('Diagram note was not found');
		const [row] = await this.database
			.insert(schema.diagrams)
			.values({
				id: diagram.id,
				userId: actor.userId,
				projectId: note.projectId,
				noteId: diagram.noteId,
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

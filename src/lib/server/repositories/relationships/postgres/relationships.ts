import { and, eq, or, sql } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId, NoteRelationship } from '$lib/models/notes';
import type { RelationshipId } from '$lib/models/relationships';
import { NotFoundError } from '$lib/errors';
import type { NoteRelationshipRepository } from '$lib/server/repositories/relationships/relationships';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/relationships';
import { toRelationship } from '$lib/server/db/mappers';

export class RelationshipRecords implements NoteRelationshipRepository {
	constructor(private readonly database: Database) {}
	async findById(actor: ActorContext, id: RelationshipId): Promise<NoteRelationship | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.noteRelationships)
			.where(
				and(eq(schema.noteRelationships.id, id), eq(schema.noteRelationships.userId, actor.userId))
			);
		return row ? toRelationship(row) : undefined;
	}
	async listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRelationship[]> {
		return (
			await this.database
				.select()
				.from(schema.noteRelationships)
				.where(
					and(
						eq(schema.noteRelationships.userId, actor.userId),
						or(
							eq(schema.noteRelationships.sourceNoteId, noteId),
							eq(schema.noteRelationships.targetNoteId, noteId)
						)
					)
				)
		).map(toRelationship);
	}

	async insert(actor: ActorContext, relationship: NoteRelationship): Promise<NoteRelationship> {
		const [row] = await this.database
			.insert(schema.noteRelationships)
			.values({
				id: relationship.id,
				userId: actor.userId,
				sourceNoteId: relationship.sourceNoteId,
				targetNoteId: relationship.targetNoteId,
				kind: relationship.kind,
				justification: relationship.justification,
				sourceAnchorId: relationship.sourceAnchorId,
				provenanceId: relationship.provenanceId,
				createdAt: new Date(relationship.createdAt),
				updatedAt: new Date(relationship.updatedAt)
			})
			.returning();
		if (!row) throw new Error('Relationship insert returned no record');
		return toRelationship(row);
	}
	async findForWrite(
		actor: ActorContext,
		edge: Pick<NoteRelationship, 'sourceNoteId' | 'targetNoteId' | 'kind'>
	): Promise<NoteRelationship | undefined> {
		const key = JSON.stringify([edge.sourceNoteId, edge.targetNoteId, edge.kind]);
		await this.database.execute(
			sql`select pg_advisory_xact_lock(hashtext(${actor.userId}),hashtext(${key}))`
		);
		const [row] = await this.database
			.select()
			.from(schema.noteRelationships)
			.where(
				and(
					eq(schema.noteRelationships.userId, actor.userId),
					eq(schema.noteRelationships.sourceNoteId, edge.sourceNoteId),
					eq(schema.noteRelationships.targetNoteId, edge.targetNoteId),
					eq(schema.noteRelationships.kind, edge.kind)
				)
			)
			.for('update');
		return row ? toRelationship(row) : undefined;
	}

	async update(actor: ActorContext, relationship: NoteRelationship): Promise<NoteRelationship> {
		const [row] = await this.database
			.update(schema.noteRelationships)
			.set({
				justification: relationship.justification ?? null,
				updatedAt: new Date(relationship.updatedAt)
			})
			.where(
				and(
					eq(schema.noteRelationships.id, relationship.id),
					eq(schema.noteRelationships.userId, actor.userId)
				)
			)
			.returning();
		if (!row) throw new NotFoundError('Relationship was not found');
		return toRelationship(row);
	}

	async delete(actor: ActorContext, id: RelationshipId): Promise<void> {
		const [row] = await this.database
			.delete(schema.noteRelationships)
			.where(
				and(eq(schema.noteRelationships.id, id), eq(schema.noteRelationships.userId, actor.userId))
			)
			.returning({ id: schema.noteRelationships.id });
		if (!row) throw new NotFoundError('Relationship was not found');
	}
}

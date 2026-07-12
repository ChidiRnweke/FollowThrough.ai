import { and, eq, or } from 'drizzle-orm';
import type { ActorContext, NoteId, NoteRelationship, RelationshipId } from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { NoteRelationshipRepository } from '$lib/repositories/relationships';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toRelationship } from '../domain/mappers';

export class PostgresRelationshipRepository implements NoteRelationshipRepository {
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
			.onConflictDoUpdate({
				target: [
					schema.noteRelationships.sourceNoteId,
					schema.noteRelationships.targetNoteId,
					schema.noteRelationships.kind
				],
				set: {
					justification: relationship.justification,
					updatedAt: new Date(relationship.updatedAt)
				}
			})
			.returning();
		return toRelationship(row!);
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

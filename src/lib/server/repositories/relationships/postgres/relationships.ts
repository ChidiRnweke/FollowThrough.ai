import { decideRelationshipWrite } from '$lib/models/relationships';
import type { AppliedChange } from '$lib/models/proposal-effects';
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
		return (await this.insertWithChange(actor, relationship)).after;
	}
	async insertWithChange(
		actor: ActorContext,
		relationship: NoteRelationship
	): Promise<AppliedChange<NoteRelationship>> {
		return this.database.transaction(async (transaction) => {
			const key = JSON.stringify([
				relationship.sourceNoteId,
				relationship.targetNoteId,
				relationship.kind
			]);
			await transaction.execute(
				sql`select pg_advisory_xact_lock(hashtext(${actor.userId}),hashtext(${key}))`
			);
			const [existing] = await transaction
				.select()
				.from(schema.noteRelationships)
				.where(
					and(
						eq(schema.noteRelationships.userId, actor.userId),
						eq(schema.noteRelationships.sourceNoteId, relationship.sourceNoteId),
						eq(schema.noteRelationships.targetNoteId, relationship.targetNoteId),
						eq(schema.noteRelationships.kind, relationship.kind)
					)
				)
				.for('update');
			const change = decideRelationshipWrite(
				relationship,
				existing ? toRelationship(existing) : null
			);
			if (change.kind === 'unchanged') return change;
			if (change.kind === 'modified') {
				await transaction
					.update(schema.noteRelationships)
					.set({
						justification: change.after.justification ?? null,
						updatedAt: new Date(change.after.updatedAt)
					})
					.where(
						and(
							eq(schema.noteRelationships.id, change.after.id),
							eq(schema.noteRelationships.userId, actor.userId)
						)
					);
			} else {
				await transaction.insert(schema.noteRelationships).values({
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
				});
			}
			return change;
		});
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

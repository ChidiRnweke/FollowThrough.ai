import { and, asc, eq } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { ExternalReference, ReferenceId } from '$lib/models/references';
import type { NoteId } from '$lib/models/notes';
import { NotFoundError } from '$lib/errors';
import type { ReferenceRepository } from '$lib/server/repositories/references/references';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/references';
import { toReference } from '$lib/server/db/mappers';

export class ReferenceRecords implements ReferenceRepository {
	constructor(private readonly database: Database) {}
	async listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly ExternalReference[]> {
		return (
			await this.database
				.select()
				.from(schema.references)
				.where(
					and(eq(schema.references.userId, actor.userId), eq(schema.references.noteId, noteId))
				)
				.orderBy(asc(schema.references.createdAt))
		).map(toReference);
	}
	async insert(actor: ActorContext, reference: ExternalReference): Promise<ExternalReference> {
		const [note] = await this.database
			.select({ projectId: schema.notes.projectId })
			.from(schema.notes)
			.where(and(eq(schema.notes.id, reference.noteId), eq(schema.notes.userId, actor.userId)));
		if (!note) throw new NotFoundError('Reference note was not found');
		const [row] = await this.database
			.insert(schema.references)
			.values({
				id: reference.id,
				userId: actor.userId,
				projectId: note.projectId,
				noteId: reference.noteId,
				url: reference.url,
				title: reference.title,
				tier: reference.tier,
				relevanceNote: reference.relevanceNote,
				sourceAnchorId: reference.sourceAnchorId,
				provenanceId: reference.provenanceId,
				createdAt: new Date(reference.createdAt)
			})
			.returning();
		return toReference(row!);
	}
	async delete(actor: ActorContext, id: ReferenceId): Promise<void> {
		const [row] = await this.database
			.delete(schema.references)
			.where(and(eq(schema.references.id, id), eq(schema.references.userId, actor.userId)))
			.returning({ id: schema.references.id });
		if (!row) throw new NotFoundError('Reference was not found');
	}
}

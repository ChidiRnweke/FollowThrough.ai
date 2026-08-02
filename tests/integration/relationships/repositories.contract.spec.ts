import { describe, expect, it } from 'vitest';
import type { Note, NoteId, NoteRelationship } from '$lib/models/notes';
import type { RelationshipId } from '$lib/models/relationships';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { RelationshipRecords } from '$lib/server/repositories/relationships/postgres/relationships';
import { context, now, seedNote } from '../database-harness';
describe('Postgres relationship repository invariants', () => {
	it('stores a duplicate semantic edge idempotently', async () => {
		const { owner, note } = await seedNote('28');
		const second: Note = {
			...note,
			id: '40000000-0000-4000-8000-000000000029' as NoteId,
			position: 1
		};
		await new NoteRecords(context.db).insert(owner, second);
		const repository = new RelationshipRecords(context.db);
		const relationship: NoteRelationship = {
			id: '80000000-0000-4000-8000-000000000028' as RelationshipId,
			userId: owner.userId,
			sourceNoteId: note.id,
			targetNoteId: second.id,
			kind: 'mentions',
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, relationship);
		await repository.insert(owner, {
			...relationship,
			id: '80000000-0000-4000-8000-000000000029' as RelationshipId
		});
		expect(await repository.listForNote(owner, note.id)).toHaveLength(1);
	});
});

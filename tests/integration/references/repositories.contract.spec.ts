import { describe, expect, it } from 'vitest';
import type { ExternalReference, ReferenceId, Url } from '$lib/models/references';
import { ReferenceRecords } from '$lib/server/repositories/references/postgres/references';
import { actor, context, now, seedNote } from '../database-harness';
describe('Postgres reference repository invariants', () => {
	it('lists only references owned by the actor', async () => {
		const { owner, note } = await seedNote('30');
		const repository = new ReferenceRecords(context.db);
		const reference: ExternalReference = {
			id: '90000000-0000-4000-8000-000000000030' as ReferenceId,
			userId: owner.userId,
			noteId: note.id,
			url: 'https://example.com/reference' as Url,
			title: 'Reference',
			tier: 'official',
			relevanceNote: 'Contract',
			createdAt: now
		};
		await repository.insert(owner, reference);
		expect(await repository.listForNote(actor('31'), note.id)).toEqual([]);
	});
});

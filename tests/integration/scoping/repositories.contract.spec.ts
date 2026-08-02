import { describe, expect, it } from 'vitest';
import type { DiagramId } from '$lib/models/diagrams';
import type { ExternalReference, ReferenceId, Url } from '$lib/models/references';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { ReferenceRecords } from '$lib/server/repositories/references/postgres/references';
import {
	actor,
	context,
	now,
	seedNote,
	seedProvenance
} from '../database-harness';

/**
 * Actor-scoping matrix for the single-assert repository contracts. Each test
 * proves the one SQL fact no in-memory fake can: that reads never cross the
 * actor boundary. Grouping them here amortizes the shared database container
 * across what used to be four per-file one-test suites.
 */
describe('Postgres actor-scoping matrix', () => {
	it('limits diagram project listing to the requesting actor', async () => {
		const { owner, project, note } = await seedNote('32');
		const repository = new DiagramRecords(context.db);
		await repository.insert(owner, {
			id: 'a0000000-0000-4000-8000-000000000032' as DiagramId,
			userId: owner.userId,
			noteId: note.id,
			kind: 'mermaid',
			source: 'flowchart LR\nA --> B',
			searchableText: 'A B',
			createdAt: now,
			updatedAt: now
		});
		expect((await repository.listForProject(owner, project.id)).map((item) => item.noteId)).toEqual(
			[note.id]
		);
	});

	it('does not reveal another actor’s user record', async () => {
		const owner = actor('5');
		const repository = new UserRecords(context.db);
		await repository.ensureLocal(owner);
		expect(await repository.findById(actor('6'), owner.userId)).toBeUndefined();
	});

	it('does not reveal provenance to another actor', async () => {
		const { owner } = await seedNote('23');
		const provenance = await seedProvenance(owner, '23');
		expect(
			await new ProvenanceRecords(context.db).findById(actor('24'), provenance.id)
		).toBeUndefined();
	});

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

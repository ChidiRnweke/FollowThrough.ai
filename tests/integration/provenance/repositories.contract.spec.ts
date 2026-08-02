import { describe, expect, it } from 'vitest';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { actor, context, seedNote, seedProvenance } from '../database-harness';
describe('Postgres provenance repository invariants', () => {
	it('does not reveal provenance to another actor', async () => {
		const { owner } = await seedNote('23');
		const provenance = await seedProvenance(owner, '23');
		expect(
			await new ProvenanceRecords(context.db).findById(actor('24'), provenance.id)
		).toBeUndefined();
	});
});

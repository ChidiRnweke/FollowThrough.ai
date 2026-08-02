import { describe, expect, it } from 'vitest';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { actor, context } from '../database-harness';
describe('Postgres project repository invariants', () => {
	// The remaining project behaviors (actor scoping, archived hide, name reuse,
	// case-insensitive and partial uniqueness, rename conflicts) are proven at the
	// unit layer by controllers/projects/controller.spec.ts and
	// services/projects/catalog.spec.ts, and the index shape by
	// schema/schema.contract.spec.ts. This file keeps only what no fake can prove:
	// the per-user partial index allowing the same name across actors.
	it('allows the same project name for a different actor', async () => {
		const repository = new ProjectRecords(context.db);
		await repository.insert(actor('403'), { name: 'Shared name' });
		const other = await repository.insert(actor('404'), { name: 'Shared name' });
		expect(other.name).toBe('Shared name');
	});
});

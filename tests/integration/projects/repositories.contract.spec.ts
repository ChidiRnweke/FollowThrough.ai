import { describe, expect, it } from 'vitest';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { actor, context } from '../database-harness';
describe('Postgres project repository invariants', () => {
	// The remaining project behaviors (actor scoping, archived hide, name reuse,
	// case-insensitive and partial uniqueness, rename conflicts) are proven at the
	// unit layer by controllers/projects/controller.spec.ts and
	// services/projects/catalog.spec.ts, and the index shape by
	// schema/schema.contract.spec.ts. These contracts exercise the actual unique indexes.
	it('allows the same project name for a different actor', async () => {
		const repository = new ProjectRecords(context.db);
		await repository.insert(actor('403'), { name: 'Shared name' });
		const other = await repository.insert(actor('404'), { name: 'Shared name' });
		expect(other.name).toBe('Shared name');
	});
	it('rejects a second active Inbox with a different name for the same actor', async () => {
		const repository = new ProjectRecords(context.db);
		const owner = actor('19803');
		await repository.insert(owner, { name: 'First inbox', role: 'inbox' });
		await expect(
			repository.insert(owner, { name: 'Second inbox', role: 'inbox' })
		).rejects.toMatchObject({ code: 'CONFLICT' });
	});
	it('allows each actor to have an active Inbox', async () => {
		const repository = new ProjectRecords(context.db);
		await repository.insert(actor('19804'), { name: 'Inbox', role: 'inbox' });
		expect(await repository.insert(actor('19805'), { name: 'Inbox', role: 'inbox' })).toMatchObject(
			{ userId: actor('19805').userId, role: 'inbox' }
		);
	});
});

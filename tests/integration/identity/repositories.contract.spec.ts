import { describe, expect, it } from 'vitest';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { actor, context } from '../database-harness';
describe('Postgres user repository invariants', () => {
	it('does not reveal another actor’s user record', async () => {
		const owner = actor('5');
		const repository = new UserRecords(context.db);
		await repository.ensureLocal(owner);
		expect(await repository.findById(actor('6'), owner.userId)).toBeUndefined();
	});
});

import { describe, expect, it } from 'vitest';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { seedUser, actor, context } from '../database-harness';
describe('Postgres project repository invariants', () => {
	it('allows the same project name for a different actor', async () => {
		const repository = new ProjectRecords(context.db);
		await repository.insert(await seedUser('403'), { name: 'Shared name' });
		const other = await repository.insert(await seedUser('404'), { name: 'Shared name' });
		expect(other.name).toBe('Shared name');
	});
	it('rejects a second active Inbox with a different name for the same actor', async () => {
		const repository = new ProjectRecords(context.db);
		const owner = await seedUser('19803');
		await repository.insert(owner, { name: 'First inbox', role: 'inbox' });
		await expect(
			repository.insert(owner, { name: 'Second inbox', role: 'inbox' })
		).rejects.toMatchObject({ code: 'CONFLICT' });
	});
	it('allows each actor to have an active Inbox', async () => {
		const repository = new ProjectRecords(context.db);
		await repository.insert(await seedUser('19804'), { name: 'Inbox', role: 'inbox' });
		expect(
			await repository.insert(await seedUser('19805'), { name: 'Inbox', role: 'inbox' })
		).toMatchObject({ userId: actor('19805').userId, role: 'inbox' });
	});
});

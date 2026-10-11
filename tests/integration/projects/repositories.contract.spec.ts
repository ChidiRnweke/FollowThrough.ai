import { describe, expect, it } from 'vitest';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { seedUser, actor, context } from '../database-harness';
describe('Postgres project repository invariants', () => {
	it('allows the same project name for a different actor', async () => {
		await new ProjectRecords(await seedUser('403'), context.db).insert({ name: 'Shared name' });
		const other = await new ProjectRecords(await seedUser('404'), context.db).insert({
			name: 'Shared name'
		});
		expect(other.name).toBe('Shared name');
	});
	it('rejects a second active Inbox with a different name for the same actor', async () => {
		const repository = new ProjectRecords(await seedUser('19803'), context.db);
		await repository.insert({ name: 'First inbox', role: 'inbox' });
		await expect(repository.insert({ name: 'Second inbox', role: 'inbox' })).rejects.toMatchObject({
			code: 'CONFLICT'
		});
	});
	it('allows each actor to have an active Inbox', async () => {
		await new ProjectRecords(await seedUser('19804'), context.db).insert({
			name: 'Inbox',
			role: 'inbox'
		});
		expect(
			await new ProjectRecords(await seedUser('19805'), context.db).insert({
				name: 'Inbox',
				role: 'inbox'
			})
		).toMatchObject({ userId: actor('19805').userId, role: 'inbox' });
	});
});

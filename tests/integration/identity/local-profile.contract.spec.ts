import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { LocalIdentity } from '$lib/server/controllers/identity/local';
import { UserDirectory } from '$lib/server/services/identity/users';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { actor, context, seedProvenance } from '../database-harness';

it('establishes a local administrator before the first provenance and project writes', async () => {
	const owner = actor('27001');
	const users = new UserDirectory(new UserRecords(owner, context.db));
	await new LocalIdentity({ provisioner: users, users }).initializeLocal();
	await seedProvenance(owner, '27001');
	await new ProjectRecords(owner, context.db).insert({ name: 'Local workspace' });
	expect(await users.get()).toMatchObject({
		id: owner.userId,
		role: 'ADMIN',
		email: `${owner.userId}@local.invalid`
	});
});
it('keeps an existing waiting account unchanged during local initialization', async () => {
	const records = new UserRecords(testActor(), context.db);
	const original = await records.create({
		email: 'local-profile-27002@example.test',
		displayName: 'Waiting reader',
		role: 'WAITING'
	});
	const users = new UserDirectory(records);
	expect(
		await new LocalIdentity(
			{ userId: original.id },
			{ provisioner: users, users }
		).initializeLocal()
	).toEqual(original);
});
it('rejects a missing profile during an ordinary read', async () => {
	await expect(
		new UserDirectory(new UserRecords(testActor(), context.db)).get()
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('requires an existing account before a project can be created', async () => {
	await expect(
		new ProjectRecords(actor('27004'), context.db).insert({ name: 'Unestablished workspace' })
	).rejects.toThrow();
});

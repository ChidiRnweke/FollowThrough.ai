import { describe, expect, it } from 'vitest';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { UserDirectory } from './users';

describe('User boundary invariants', () => {
	it('creates the local actor record when it is absent', async () => {
		const repository = new InMemoryUserRepository();
		const user = await new UserDirectory(repository).initializeLocal(testActor());
		expect(user).toMatchObject({ id: testActor().userId, role: 'ADMIN' });
	});

	it('does not create a second record for an existing actor', async () => {
		const repository = new InMemoryUserRepository();
		const service = new UserDirectory(repository);
		await service.initializeLocal(testActor());
		await service.initializeLocal(testActor());
		expect(repository.users).toHaveLength(1);
	});

	it('returns not-found when persistence cannot establish the actor', async () => {
		const repository = new InMemoryUserRepository();
		repository.createOnEnsure = false;
		await expect(new UserDirectory(repository).initializeLocal(testActor())).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

it('keeps an existing admitted account unchanged during local initialization', async () => {
	const repository = new InMemoryUserRepository();
	const service = new UserDirectory(repository);
	const original = await service.initializeLocal(testActor());
	const existing = { ...original, role: 'USER' as const, displayName: 'Existing reader' };
	repository.users = [existing];
	expect(await service.initializeLocal(testActor())).toEqual(existing);
});

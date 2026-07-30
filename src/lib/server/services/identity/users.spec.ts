import { describe, expect, it } from 'vitest';
import { InMemoryUserRepository } from '$lib/testing/fakes/in-memory-users';
import { testActor } from '$lib/testing/fixtures/domain-builders';
import { UserDirectory } from './users';

describe('User boundary invariants', () => {
	it('creates the local actor record when it is absent', async () => {
		const repository = new InMemoryUserRepository();
		const user = await new UserDirectory(repository).get(testActor());
		expect(user.id).toBe(testActor().userId);
	});

	it('does not create a second record for an existing actor', async () => {
		const repository = new InMemoryUserRepository();
		const service = new UserDirectory(repository);
		await service.get(testActor());
		await service.get(testActor());
		expect(repository.users).toHaveLength(1);
	});

	it('returns not-found when persistence cannot establish the actor', async () => {
		const repository = new InMemoryUserRepository();
		repository.createOnEnsure = false;
		await expect(new UserDirectory(repository).get(testActor())).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

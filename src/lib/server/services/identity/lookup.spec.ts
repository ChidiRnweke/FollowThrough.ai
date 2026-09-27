import { expect, it } from 'vitest';
import { UserDirectory } from './users';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

it('rejects an absent user instead of creating an administrator during a read', async () => {
	const repository = new InMemoryUserRepository();
	await expect(new UserDirectory(repository).get(testActor())).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});

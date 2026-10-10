import { expect, it } from 'vitest';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { UserDirectory } from './users';

it('rejects an ordinary read when the user does not exist', async () => {
	await expect(
		new UserDirectory(new InMemoryUserRepository()).get(testActor())
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

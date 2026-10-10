import { requestActor } from '$lib/server/config';
import { expect, it } from 'vitest';
import { LocalIdentity } from './local-identity';
import { UserDirectory } from '$lib/server/services/identity/users';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const repository = new InMemoryUserRepository();
	const users = new UserDirectory(repository);
	return { repository, users, controller: new LocalIdentity({ resolveActor: testActor, users }) };
};
it('establishes the profile before returning an actor for downstream writes', async () => {
	const { controller, users } = setup();
	const actor = await controller.localActor();
	expect(await users.get(actor)).toMatchObject({ id: actor.userId, role: 'ADMIN' });
});
it('reuses the existing local account', async () => {
	const { controller, repository } = setup();
	await controller.localActor();
	await controller.localActor();
	expect(repository.users).toHaveLength(1);
});
it('preserves the role and profile of an existing account', async () => {
	const { controller, repository } = setup();
	await controller.localActor();
	const existing = { ...repository.users[0], role: 'USER' as const, displayName: 'Existing user' };
	repository.users = [existing];
	await controller.localActor();
	expect(repository.users).toEqual([existing]);
});
it('rejects an unresolved authenticated actor before persisting a profile', async () => {
	const { users, repository } = setup();
	const previous = process.env.AUTHENTIK_CLIENT_ID;
	process.env.AUTHENTIK_CLIENT_ID = 'local-identity-test';
	try {
		const controller = new LocalIdentity({ resolveActor: requestActor, users });
		const result = await controller.localActor().then(
			(actor) => ({ kind: 'success', actor }),
			(failure) => ({ kind: 'failure', failure, users: repository.users })
		);
		expect(result).toEqual({
			kind: 'failure',
			failure: new Error('Authenticated user is required when authentication is enabled'),
			users: []
		});
	} finally {
		if (previous === undefined) delete process.env.AUTHENTIK_CLIENT_ID;
		else process.env.AUTHENTIK_CLIENT_ID = previous;
	}
});
it('propagates profile persistence failures', async () => {
	const { controller, repository } = setup();
	repository.ensureFailure = new Error('Profile storage unavailable');
	await expect(controller.localActor()).rejects.toBe(repository.ensureFailure);
});

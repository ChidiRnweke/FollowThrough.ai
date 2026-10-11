import { describe, expect, it } from 'vitest';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { UserDirectory } from '$lib/server/services/identity/users';
import { LocalIdentity } from './local';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
const controller = (repository: InMemoryUserRepository) => {
	const users = new UserDirectory(repository);
	return new LocalIdentity(capabilityDependencies({ provisioner: users, users }));
};

describe('User boundary invariants', () => {
	it('creates the local actor record when it is absent', async () => {
		const repository = new InMemoryUserRepository(testActor());
		const user = await controller(repository).initializeLocal();
		expect(user).toMatchObject({ id: testActor().userId, role: 'ADMIN' });
	});

	it('does not create a second record for an existing actor', async () => {
		const repository = new InMemoryUserRepository(testActor());
		const service = controller(repository);
		await service.initializeLocal();
		await service.initializeLocal();
		expect(repository.users).toHaveLength(1);
	});

	it('returns not-found when persistence cannot establish the actor', async () => {
		const repository = new InMemoryUserRepository(testActor());
		repository.createOnEnsure = false;
		await expect(controller(repository).initializeLocal()).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

it('keeps an existing admitted account unchanged during local initialization', async () => {
	const repository = new InMemoryUserRepository(testActor());
	const service = controller(repository);
	const original = await service.initializeLocal();
	const existing = { ...original, role: 'USER' as const, displayName: 'Existing reader' };
	repository.users = [existing];
	expect(await service.initializeLocal()).toEqual(existing);
});

it('propagates profile persistence failures', async () => {
	const repository = new InMemoryUserRepository(testActor());
	repository.ensureFailure = new Error('Profile storage unavailable');
	await expect(controller(repository).initializeLocal()).rejects.toBe(repository.ensureFailure);
});

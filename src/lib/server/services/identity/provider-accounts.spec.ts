import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '$lib/models/identity';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { ProviderAccounts } from './provider-accounts';

const profile = {
	sub: 'provider-person-1',
	email: 'person@example.test',
	email_verified: true,
	name: 'Example Person'
};
/** An account that already holds the profile's email, as an administrator or earlier sign-in left it. */
const existingAccount = async (role: UserRole, authProviderId?: string) => {
	const users = new InMemoryUserRepository(testActor());
	const existing = await users.create({
		email: profile.email,
		displayName: 'Existing Person',
		role,
		...(authProviderId ? { authProvider: 'authentik', authProviderId } : {})
	});
	return { users, existing, accounts: new ProviderAccounts(users) };
};
describe('provider account resolution', () => {
	it('creates a waiting account for a new provider identity', async () => {
		const users = new InMemoryUserRepository(testActor());
		expect(await new ProviderAccounts(users).resolve(profile)).toMatchObject({
			kind: 'resolved',
			user: {
				email: profile.email,
				displayName: profile.name,
				role: 'WAITING',
				authProvider: 'authentik',
				authProviderId: profile.sub
			}
		});
	});
	it('keeps the existing account when its provider id matches', async () => {
		const users = new InMemoryUserRepository(testActor());
		const accounts = new ProviderAccounts(users);
		const existing = await accounts.resolve(profile);
		expect(await accounts.resolve({ ...profile, email: 'changed@example.test' })).toEqual(existing);
	});
	it('links a verified email to an existing account that has no provider identity yet', async () => {
		const { users, existing, accounts } = await existingAccount('USER');
		const linked = { ...existing, authProvider: 'authentik', authProviderId: profile.sub };
		expect({ resolved: await accounts.resolve(profile), stored: users.users }).toEqual({
			resolved: { kind: 'resolved', user: linked },
			stored: [linked]
		});
	});
	it('refuses to link an unverified email to an existing account', async () => {
		const { users, existing, accounts } = await existingAccount('USER');
		expect({
			resolved: await accounts.resolve({ ...profile, email_verified: false }),
			stored: users.users
		}).toEqual({
			resolved: { kind: 'failure', reason: 'unverified-email' },
			stored: [existing]
		});
	});
	it.each(['USER', 'ADMIN'] as const)(
		'refuses to take over a %s account bound to another provider identity',
		async (role) => {
			const { users, existing, accounts } = await existingAccount(role, 'provider-person-other');
			expect({ resolved: await accounts.resolve(profile), stored: users.users }).toEqual({
				resolved: { kind: 'failure', reason: 'bound-elsewhere' },
				stored: [existing]
			});
		}
	);
});

import { describe, expect, it } from 'vitest';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { ProviderAccounts } from './provider-accounts';

const profile = {
	sub: 'provider-person-1',
	email: 'person@example.test',
	email_verified: true,
	name: 'Example Person'
};
describe('provider account resolution', () => {
	it('creates a waiting account for a new provider identity', async () => {
		const users = new InMemoryUserRepository();
		expect(await new ProviderAccounts(users).resolve(profile)).toMatchObject({
			email: profile.email,
			displayName: profile.name,
			role: 'WAITING',
			authProvider: 'authentik',
			authProviderId: profile.sub
		});
	});
	it('keeps the existing account when its provider id matches', async () => {
		const users = new InMemoryUserRepository();
		const accounts = new ProviderAccounts(users);
		const existing = await accounts.resolve(profile);
		expect(await accounts.resolve({ ...profile, email: 'changed@example.test' })).toEqual(existing);
	});
	it('retains the existing email-linking policy without changing admission', async () => {
		const users = new InMemoryUserRepository();
		const existing = await users.create({
			email: profile.email,
			displayName: 'Existing Person',
			role: 'USER'
		});
		const resolved = await new ProviderAccounts(users).resolve({
			...profile,
			email_verified: false
		});
		expect(resolved).toEqual({
			...existing,
			authProvider: 'authentik',
			authProviderId: profile.sub
		});
	});
});

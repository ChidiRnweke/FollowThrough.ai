import { describe, expect, it } from 'vitest';
import { AuthentikClient } from './authentik';

const config = {
	domain: 'identity.test',
	clientId: 'test-client',
	clientSecret: 'test-secret',
	callbackUrl: 'https://app.test/auth/callback'
};
describe('Authentik response boundary', () => {
	it('reads the default Authentik email and profile claims', async () => {
		// Producer mapping: https://github.com/goauthentik/authentik/blob/main/blueprints/system/providers-oauth2.yaml
		const profile = {
			sub: 'provider-person-1',
			email: 'person@example.test',
			email_verified: false,
			name: 'Example Person',
			given_name: 'Example',
			preferred_username: 'person',
			nickname: 'person',
			groups: ['Members']
		};
		const client = new AuthentikClient(config, async () => Response.json(profile));
		expect(await client.getUserInfo('test-token')).toEqual({
			sub: profile.sub,
			email: profile.email,
			email_verified: false,
			name: profile.name,
			nickname: profile.nickname
		});
	});
	it('rejects token responses without an access token', async () => {
		const client = new AuthentikClient(config, async () =>
			Response.json({ token_type: 'Bearer', expires_in: 3600 })
		);
		await expect(client.exchangeCode('code', 'verifier')).rejects.toThrow();
	});
	it('rejects a profile without its provider identity', async () => {
		const client = new AuthentikClient(config, async () =>
			Response.json({ email: 'person@example.test', email_verified: true })
		);
		await expect(client.getUserInfo('test-token')).rejects.toThrow();
	});
});

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

it('binds the authorization code exchange to its verifier and configured callback', async () => {
	const requests: { url: string; method: string; body: Record<string, string> }[] = [];
	const fetch: typeof globalThis.fetch = async (url, init) => {
		const request = new Request(url, init);
		requests.push({
			url: request.url,
			method: request.method,
			body: Object.fromEntries(new URLSearchParams(await request.text()))
		});
		return Response.json({ access_token: 'test-access', token_type: 'Bearer', expires_in: 3600 });
	};
	await new AuthentikClient(config, fetch).exchangeCode('returned-code', 'original-verifier');
	expect(requests).toEqual([
		{
			url: 'https://identity.test/application/o/token/',
			method: 'POST',
			body: {
				grant_type: 'authorization_code',
				client_id: config.clientId,
				client_secret: config.clientSecret,
				code: 'returned-code',
				redirect_uri: config.callbackUrl,
				code_verifier: 'original-verifier'
			}
		}
	]);
});
it('uses the exchanged access token only as the profile request bearer credential', async () => {
	const requests: { url: string; authorization: string | null }[] = [];
	const fetch: typeof globalThis.fetch = async (url, init) => {
		const request = new Request(url, init);
		requests.push({ url: request.url, authorization: request.headers.get('Authorization') });
		return Response.json({
			sub: 'provider-person',
			email: 'person@example.test',
			email_verified: true
		});
	};
	await new AuthentikClient(config, fetch).getUserInfo('exchanged-access-token');
	expect(requests).toEqual([
		{
			url: 'https://identity.test/application/o/userinfo/',
			authorization: 'Bearer exchanged-access-token'
		}
	]);
});

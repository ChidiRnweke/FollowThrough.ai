import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AuthentikClient } from '$lib/server/repositories/identity/authentik';
import { OAuthAuthorization } from './oauth-authorization';

const config = {
	domain: 'identity.test',
	clientId: 'test-client',
	clientSecret: 'test-secret',
	callbackUrl: 'https://app.test/auth/callback'
};
const authorization = new OAuthAuthorization(new AuthentikClient(config), config);
describe('OAuth authorization challenge', () => {
	it('binds the challenge to its generated verifier with SHA-256', async () => {
		const challenge = await authorization.generatePKCE();
		expect(challenge.codeChallenge).toBe(
			createHash('sha256').update(challenge.codeVerifier).digest('base64url')
		);
	});
	it('uses independent URL-safe values for state and verifier', async () => {
		const challenge = await authorization.generatePKCE();
		expect({
			state: /^[A-Za-z0-9_-]{43}$/.test(challenge.state),
			verifier: /^[A-Za-z0-9_-]{43}$/.test(challenge.codeVerifier),
			distinct: challenge.state !== challenge.codeVerifier
		}).toEqual({ state: true, verifier: true, distinct: true });
	});
	it('includes the callback, state, and challenge in the provider authorization URL', async () => {
		const url = new URL(await authorization.getAuthorizationUrl('test-state', 'test-challenge'));
		expect({
			origin: url.origin,
			path: url.pathname,
			parameters: Object.fromEntries(url.searchParams)
		}).toEqual({
			origin: 'https://identity.test',
			path: '/application/o/authorize/',
			parameters: {
				response_type: 'code',
				client_id: 'test-client',
				redirect_uri: config.callbackUrl,
				scope: 'openid profile email',
				state: 'test-state',
				code_challenge: 'test-challenge',
				code_challenge_method: 'S256'
			}
		});
	});
});

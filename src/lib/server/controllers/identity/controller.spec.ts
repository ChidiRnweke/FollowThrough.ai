import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { SignIn } from './controller';
import { AuthentikClient } from '$lib/server/repositories/identity/authentik';
import { OAuthAuthorization } from '$lib/server/services/identity/oauth-authorization';
import { ProviderAccounts } from '$lib/server/services/identity/provider-accounts';
import { SessionRegistry } from '$lib/server/services/identity/sessions';
import { InMemorySessionRepository } from '$lib/testing/identity/fakes/in-memory-sessions';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';

const config = {
	domain: 'identity.test',
	clientId: 'test-client',
	clientSecret: 'test-secret',
	callbackUrl: 'https://app.test/auth/callback',
	requestTimeoutMs: 10_000
};
const profile = {
	sub: 'provider-account-1',
	email: 'person@example.test',
	email_verified: true,
	name: 'Example Person'
};
const setup = (failure?: 'token' | 'profile') => {
	const users = new InMemoryUserRepository(testActor());
	const sessions = new InMemorySessionRepository();
	sessions.users = users.users;
	const registry = new SessionRegistry(sessions, { maxLifetimeMs: 90 * 24 * 60 * 60 * 1000 }, () =>
		Date.parse('2026-09-16T12:00:00Z')
	);
	const fetch: typeof globalThis.fetch = async (url) => {
		const endpoint = String(url).endsWith('/token/') ? 'token' : 'profile';
		if (endpoint === failure)
			return Response.json({ error: 'Provider rejected request' }, { status: 400 });
		return Response.json(
			endpoint === 'token'
				? { access_token: 'test-access', token_type: 'Bearer', expires_in: 3600 }
				: profile
		);
	};
	const controller = new SignIn({
		authorization: new OAuthAuthorization(new AuthentikClient(config, fetch), config),
		accounts: new ProviderAccounts(users),
		sessions: registry
	});
	return { controller, registry, sessions, users };
};
const signedInWith = async (controller: SignIn, code: string) => {
	const outcome = await controller.completeOAuthFlow(code, 'test-verifier');
	if (outcome.kind === 'failure') throw new Error(`Sign-in was refused: ${outcome.reason}`);
	return outcome;
};
describe('provider sign-in session creation', () => {
	it('creates a session that ordinary request authentication can validate', async () => {
		const { controller, registry } = setup();
		const signedIn = await signedInWith(controller, 'test-code');
		expect(await registry.validateSession(signedIn.token)).toEqual({
			user: signedIn.user,
			session: signedIn.session
		});
	});
	it('reuses the provider account on a later sign-in', async () => {
		const { controller, users } = setup();
		const first = await signedInWith(controller, 'first-code');
		const second = await signedInWith(controller, 'second-code');
		expect({ first: first.user.id, second: second.user.id, users: users.users }).toEqual({
			first: first.user.id,
			second: first.user.id,
			users: [first.user]
		});
	});
	it('creates no session when the email belongs to an account bound to another sign-in', async () => {
		const { controller, sessions, users } = setup();
		await users.create({
			email: profile.email,
			displayName: 'Existing Person',
			role: 'ADMIN',
			authProvider: 'authentik',
			authProviderId: 'provider-account-other'
		});
		expect({
			outcome: await controller.completeOAuthFlow('test-code', 'test-verifier'),
			sessions: [...sessions.sessions.values()]
		}).toEqual({ outcome: { kind: 'failure', reason: 'bound-elsewhere' }, sessions: [] });
	});
	it('does not report successful sign-in when session persistence fails', async () => {
		const { controller, sessions } = setup();
		sessions.failure = 'write';
		await expect(controller.completeOAuthFlow('test-code', 'test-verifier')).rejects.toThrow(
			'Session storage unavailable'
		);
	});
	it.each(['token', 'profile'] as const)(
		'creates no session when the provider rejects %s retrieval',
		async (failure) => {
			const { controller, sessions } = setup(failure);
			const result = await controller.completeOAuthFlow('test-code', 'test-verifier').then(
				() => ({ kind: 'success' }),
				() => ({ kind: 'failure' })
			);
			expect({ result, sessions: [...sessions.sessions.values()] }).toEqual({
				result: { kind: 'failure' },
				sessions: []
			});
		}
	);
});

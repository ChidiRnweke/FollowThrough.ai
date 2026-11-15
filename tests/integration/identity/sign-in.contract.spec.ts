import { expect, it } from 'vitest';
import { SignIn } from '$lib/server/controllers/identity/controller';
import { AuthentikClient } from '$lib/server/repositories/identity/authentik';
import { UserAccountRecords } from '$lib/server/repositories/identity/postgres/users';
import { SessionRecords } from '$lib/server/repositories/identity/postgres/sessions';
import { OAuthAuthorization } from '$lib/server/services/identity/oauth-authorization';
import { ProviderAccounts } from '$lib/server/services/identity/provider-accounts';
import { SessionRegistry } from '$lib/server/services/identity/sessions';
import { context } from '../database-harness';

const setup = (suffix: string) => {
	const config = {
		domain: 'identity.test',
		clientId: 'test-client',
		clientSecret: 'test-secret',
		callbackUrl: 'https://app.test/auth/callback',
		requestTimeoutMs: 10_000
	};
	const fetch: typeof globalThis.fetch = async (url) =>
		Response.json(
			String(url).endsWith('/token/')
				? { access_token: 'test-access', token_type: 'Bearer', expires_in: 3600 }
				: {
						sub: `sign-in-${suffix}`,
						email: `sign-in-${suffix}@example.test`,
						email_verified: true,
						name: 'Sign-in contract'
					}
		);
	const sessions = new SessionRegistry(new SessionRecords(context.db), {
		maxLifetimeMs: 90 * 24 * 60 * 60 * 1000
	});
	return {
		sessions,
		controller: new SignIn({
			authorization: new OAuthAuthorization(new AuthentikClient(config, fetch), config),
			accounts: new ProviderAccounts(new UserAccountRecords(context.db)),
			sessions
		})
	};
};
const signIn = async (controller: SignIn) => {
	const outcome = await controller.completeOAuthFlow('returned-code', 'original-verifier');
	if (outcome.kind === 'failure') throw new Error(`Sign-in was refused: ${outcome.reason}`);
	return outcome;
};
it('persists a completed provider sign-in that normal request authentication can validate', async () => {
	const { controller, sessions } = setup('24001');
	const signedIn = await signIn(controller);
	expect(await sessions.validateSession(signedIn.token)).toEqual({
		user: signedIn.user,
		session: signedIn.session
	});
});
it('invalidates the persisted sign-in session when logout completes', async () => {
	const { controller, sessions } = setup('24002');
	const signedIn = await signIn(controller);
	await sessions.logout(signedIn.token);
	expect(await sessions.validateSession(signedIn.token)).toBeNull();
});
it('does not take over an account already bound to another provider identity', async () => {
	const { controller } = setup('24003');
	const bound = await new UserAccountRecords(context.db).create({
		email: 'sign-in-24003@example.test',
		displayName: 'Bound account',
		role: 'ADMIN',
		authProvider: 'authentik',
		authProviderId: 'sign-in-other-24003'
	});
	expect({
		outcome: await controller.completeOAuthFlow('returned-code', 'original-verifier'),
		stored: (await new UserAccountRecords(context.db).findByEmail(bound.email))?.authProviderId
	}).toEqual({
		outcome: { kind: 'failure', reason: 'bound-elsewhere' },
		stored: 'sign-in-other-24003'
	});
});
it('links a verified sign-in to the unbound account that holds its email', async () => {
	const { controller } = setup('24004');
	const unbound = await new UserAccountRecords(context.db).create({
		email: 'sign-in-24004@example.test',
		displayName: 'Unbound account',
		role: 'USER'
	});
	const signedIn = await signIn(controller);
	expect({ id: signedIn.user.id, providerId: signedIn.user.authProviderId }).toEqual({
		id: unbound.id,
		providerId: 'sign-in-24004'
	});
});

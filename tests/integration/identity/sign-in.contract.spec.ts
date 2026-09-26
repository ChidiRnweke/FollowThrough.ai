import { expect, it } from 'vitest';
import { SignIn } from '$lib/server/controllers/identity/controller';
import { AuthentikClient } from '$lib/server/repositories/identity/authentik';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
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
		callbackUrl: 'https://app.test/auth/callback'
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
	const sessions = new SessionRegistry(new SessionRecords(context.db));
	return {
		sessions,
		controller: new SignIn({
			authorization: new OAuthAuthorization(new AuthentikClient(config, fetch), config),
			accounts: new ProviderAccounts(new UserRecords(context.db)),
			sessions
		})
	};
};
it('persists a completed provider sign-in that normal request authentication can validate', async () => {
	const { controller, sessions } = setup('24001');
	const signedIn = await controller.completeOAuthFlow('returned-code', 'original-verifier');
	expect(await sessions.validateSession(signedIn.session.id)).toEqual(signedIn);
});
it('invalidates the persisted sign-in session when logout completes', async () => {
	const { controller, sessions } = setup('24002');
	const signedIn = await controller.completeOAuthFlow('returned-code', 'original-verifier');
	await sessions.logout(signedIn.session.id);
	expect(await sessions.validateSession(signedIn.session.id)).toBeNull();
});

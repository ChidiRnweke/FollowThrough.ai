import { redirect, type RequestHandler } from '@sveltejs/kit';
import { returnPathSchema } from '$lib/models/identity/oauth';
import { AppFactory } from '$lib/server/factories/app-factory';
import { setPkceCookie, clearWorkspaceAccountCookie } from '$lib/server/config';

export const GET: RequestHandler = async ({ cookies, url }) => {
	clearWorkspaceAccountCookie(cookies);
	const oauthService = AppFactory.signIn();
	const pkce = await oauthService.generatePKCE();

	// Store PKCE verifier in cookie keyed by state, with where to return afterwards
	setPkceCookie(
		cookies,
		{
			state: pkce.state,
			codeVerifier: pkce.codeVerifier,
			returnTo: returnPathSchema.parse(url.searchParams.get('returnTo'))
		},
		process.env.NODE_ENV === 'production'
	);

	// Redirect to Authentik authorization endpoint
	const authUrl = await oauthService.getAuthorizationUrl(pkce.state, pkce.codeChallenge);
	redirect(302, authUrl, { external: true });
};

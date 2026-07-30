import { redirect, type RequestHandler } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import { setPkceCookie } from '$lib/utils';

export const GET: RequestHandler = async ({ cookies }) => {
	if (!AppFactory.isAuthEnabled()) {
		throw redirect(302, '/today');
	}

	const oauthService = AppFactory.signIn();
	const pkce = await oauthService.generatePKCE();

	// Store PKCE verifier in cookie keyed by state
	setPkceCookie(cookies, pkce.state, pkce.codeVerifier, process.env.NODE_ENV === 'production');

	// Redirect to Authentik authorization endpoint
	const authUrl = await oauthService.getAuthorizationUrl(pkce.state, pkce.codeChallenge);
	redirect(302, authUrl, { external: true });
};

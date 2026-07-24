import { redirect, type RequestHandler } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import { setPKCECookie } from '$lib/services/auth/authenthikAuthService';

export const GET: RequestHandler = async ({ cookies }) => {
	if (!AppFactory.isAuthEnabled()) {
		throw redirect(302, '/');
	}

	const oauthService = AppFactory.getOAuthService();
	const pkce = await oauthService.generatePKCE();

	// Store PKCE verifier in cookie keyed by state
	setPKCECookie(cookies, pkce.state, pkce.codeVerifier);

	// Redirect to Authentik authorization endpoint
	const authUrl = await oauthService.getAuthorizationUrl(pkce.state, pkce.codeChallenge);
	throw redirect(302, authUrl);
};

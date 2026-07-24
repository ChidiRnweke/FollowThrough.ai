import { redirect, error, type RequestHandler } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import {
	getPKCECookie,
	deletePKCECookie,
	setSessionCookie
} from '$lib/services/auth/authenthikAuthService';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const errorParam = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	// Check for OAuth errors
	if (errorParam) {
		throw error(400, `OAuth error: ${errorParam} - ${errorDescription || 'Unknown error'}`);
	}

	if (!code || !state) {
		throw error(400, 'Missing authorization code or state parameter');
	}

	// Retrieve PKCE data from cookie
	const pkceData = getPKCECookie(cookies, state);
	if (!pkceData) {
		throw error(400, 'Invalid or expired session. Please try logging in again.');
	}

	// Verify state matches
	if (pkceData.state !== state) {
		throw error(400, 'State mismatch. Possible CSRF attack.');
	}

	// Clean up PKCE cookie
	deletePKCECookie(cookies, state);

	try {
		// Complete the OAuth flow
		const oauthService = AppFactory.getOAuthService();
		const { session } = await oauthService.completeOAuthFlow(code, pkceData.codeVerifier);

		// Set session cookie
		setSessionCookie(cookies, session.id);
	} catch (err) {
		console.error('OAuth callback error:', err);
		throw error(500, 'Failed to complete authentication. Please try again.');
	}

	// Redirect to home
	throw redirect(302, '/');
};

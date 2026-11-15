import { redirect, error, type RequestHandler } from '@sveltejs/kit';
import { deletePkceCookie, getPkceCookie, setSessionCookie } from '$lib/server/config';
import { AppFactory } from '$lib/server/factories/app-factory';

const ACCOUNT_LINK_REFUSED =
	'This email address already belongs to another sign-in. Ask an administrator to link it.';

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
	const pkceData = getPkceCookie(cookies, state);
	if (!pkceData) {
		throw error(400, 'Invalid or expired session. Please try logging in again.');
	}

	// Verify state matches
	if (pkceData.state !== state) {
		throw error(400, 'State mismatch. Possible CSRF attack.');
	}

	// Clean up PKCE cookie
	deletePkceCookie(cookies, state);

	const outcome = await AppFactory.signIn()
		.completeOAuthFlow(code, pkceData.codeVerifier)
		.catch((err) => {
			console.error('OAuth callback error:', err);
			throw error(500, 'Failed to complete authentication. Please try again.');
		});

	// The provider identity may not take over the account that holds its email.
	if (outcome.kind === 'failure') throw error(409, ACCOUNT_LINK_REFUSED);

	// The cookie carries the token; only its digest is stored.
	setSessionCookie(
		cookies,
		outcome.token,
		process.env.NODE_ENV === 'production',
		outcome.session.expiresAt
	);

	// Return to where sign-in started: the workspace, or an MCP client's consent request
	throw redirect(302, pkceData.returnTo);
};

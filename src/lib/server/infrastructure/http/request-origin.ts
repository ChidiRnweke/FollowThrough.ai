/**
 * SvelteKit's own CSRF rule for form submissions, with one exemption. Kit's check runs before
 * `handle` and cannot exempt a route, so `vite.config.ts` turns it off and `hooks.server.ts`
 * applies this rule instead. Remote functions keep Kit's separate check.
 */

/** Content types a browser form can send without a preflight, as Kit lists them. */
const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
]);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The OAuth token endpoint must accept form posts from any client (RFC 6749 §4.1.3), and
 * server-to-server clients such as Claude send no `Origin`. It reads no cookie or session:
 * a single-use code bound to a PKCE verifier, or a refresh token, is the whole credential,
 * so a forged cross-site post gains nothing.
 */
const CROSS_SITE_FORM_ENDPOINTS = new Set(['/oauth/token']);

/** True for a form submission from another origin, or with no origin, that Kit would refuse. */
export const isForbiddenCrossSiteForm = (request: Request, url: URL): boolean => {
	const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	return (
		contentType !== undefined &&
		FORM_CONTENT_TYPES.has(contentType) &&
		MUTATING_METHODS.has(request.method) &&
		request.headers.get('origin') !== url.origin &&
		!CROSS_SITE_FORM_ENDPOINTS.has(url.pathname)
	);
};

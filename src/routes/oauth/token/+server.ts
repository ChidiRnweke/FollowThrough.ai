import { json } from '@sveltejs/kit';
import {
	MCP_WIRE_SCOPES,
	tokenRequestSchema,
	type OAuthFailure,
	type TokenRequest
} from '$lib/models/mcp-authorization';
import { AppFactory } from '$lib/server/factories/app-factory';
import type { RequestHandler } from './$types';

// RFC 6749 §5.1: token responses must not be cached.
const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

const refuse = (failure: Pick<OAuthFailure, 'error' | 'description'>): Response =>
	json(
		{ error: failure.error, error_description: failure.description },
		{ status: failure.error === 'invalid_client' ? 401 : 400, headers }
	);

const issues = (error: { issues: readonly { path: PropertyKey[]; message: string }[] }): string =>
	error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');

const readTokenRequest = async (
	request: Request
): Promise<{ kind: 'request'; request: TokenRequest } | OAuthFailure> => {
	try {
		const parsed = tokenRequestSchema.safeParse(Object.fromEntries(await request.formData()));
		return parsed.success
			? { kind: 'request', request: parsed.data }
			: { kind: 'failure', error: 'invalid_request', description: issues(parsed.error) };
	} catch (error) {
		return {
			kind: 'failure',
			error: 'invalid_request',
			description: `The token request must be application/x-www-form-urlencoded: ${String(error)}`
		};
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const read = await readTokenRequest(request);
	if (read.kind === 'failure') {
		// Refused before any controller runs, so the boundary never logs it. The body is not
		// logged: a well-formed part of it may be a code or a refresh token.
		console.warn('[oauth] token request refused', {
			error: read.error,
			description: read.description
		});
		return refuse(read);
	}

	const result = await AppFactory.mcpAuthorization().exchangeToken(
		read.request,
		new URL('/mcp', url.origin).href
	);
	if (result.kind === 'failure') return refuse(result);
	return json(
		{
			access_token: result.accessToken,
			token_type: 'Bearer',
			expires_in: result.expiresIn,
			refresh_token: result.refreshToken,
			scope: MCP_WIRE_SCOPES[result.scope]
		},
		{ headers }
	);
};

export const OPTIONS: RequestHandler = () =>
	new Response(null, {
		headers: {
			...headers,
			'access-control-allow-headers': 'content-type',
			'access-control-allow-methods': 'POST'
		}
	});

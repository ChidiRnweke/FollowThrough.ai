import { json } from '@sveltejs/kit';
import {
	MCP_WIRE_SCOPES,
	tokenRequestSchema,
	type OAuthFailure,
	type TokenRequest
} from '$lib/models/mcp-authorization';
import { requestBodyLimits } from '$lib/server/config';
import { AppFactory } from '$lib/server/factories/app-factory';
import { readBoundedText } from '$lib/server/infrastructure/http/bounded-body';
import { logRefusal } from '$lib/server/infrastructure/http/refusal-log';
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
): Promise<{ kind: 'request'; request: TokenRequest } | { kind: 'too_large' } | OAuthFailure> => {
	// RFC 6749 §4.1.3 and §6: the parameters are sent as application/x-www-form-urlencoded.
	const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (contentType !== 'application/x-www-form-urlencoded')
		return {
			kind: 'failure',
			error: 'invalid_request',
			description: 'The token request must be application/x-www-form-urlencoded.'
		};
	try {
		const body = await readBoundedText(request, requestBodyLimits().oauthToken);
		if (body.kind === 'failure' && body.reason === 'interrupted')
			return {
				kind: 'failure',
				error: 'invalid_request',
				description: 'The request body could not be read.'
			};
		if (body.kind === 'failure') return { kind: 'too_large' };
		const parsed = tokenRequestSchema.safeParse(Object.fromEntries(new URLSearchParams(body.text)));
		return parsed.success
			? { kind: 'request', request: parsed.data }
			: { kind: 'failure', error: 'invalid_request', description: issues(parsed.error) };
	} catch (error) {
		return {
			kind: 'failure',
			error: 'invalid_request',
			description: `The token request body could not be read: ${String(error)}`
		};
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const read = await readTokenRequest(request);
	if (read.kind === 'too_large') {
		logRefusal(url.pathname, 'too_large');
		return json(
			{
				error: 'invalid_request',
				error_description: `The token request is larger than ${requestBodyLimits().oauthToken} bytes.`
			},
			// chisel-ignore error-flow:raw-http-status -- an oversized body is refused with RFC 9110's 413 before the token exchange runs, like the 400 and 401 OAuth answers in `refuse`.
			{ status: 413, headers }
		);
	}
	if (read.kind === 'failure') {
		logRefusal(url.pathname, read.error);
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

// chisel-ignore-file error-flow:raw-http-status -- RFC 7591 answers registration with 201 and its errors with 400 bodies; an oversized body is 413.
import { json } from '@sveltejs/kit';
import {
	clientRegistrationRequestSchema,
	type ClientRegistrationRequest,
	type OAuthFailure
} from '$lib/models/mcp-authorization';
import { requestBodyLimits } from '$lib/server/config';
import { AppFactory } from '$lib/server/factories/app-factory';
import { readBoundedText } from '$lib/server/infrastructure/http/bounded-body';
import { logRefusal } from '$lib/server/infrastructure/http/refusal-log';
import type { RequestHandler } from './$types';

const cors = { 'access-control-allow-origin': '*' };

const refuse = (failure: Pick<OAuthFailure, 'error' | 'description'>): Response =>
	json(
		{ error: failure.error, error_description: failure.description },
		{ status: 400, headers: cors }
	);

const issues = (error: { issues: readonly { path: PropertyKey[]; message: string }[] }): string =>
	error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');

const readRegistration = async (
	request: Request
): Promise<
	{ kind: 'request'; request: ClientRegistrationRequest } | { kind: 'too_large' } | OAuthFailure
> => {
	try {
		const body = await readBoundedText(request, requestBodyLimits().oauthRegistration);
		if (body.kind === 'failure' && body.reason === 'interrupted')
			return {
				kind: 'failure',
				error: 'invalid_client_metadata',
				description: 'The request body could not be read.'
			};
		if (body.kind === 'failure') return { kind: 'too_large' };
		const parsed = clientRegistrationRequestSchema.safeParse(JSON.parse(body.text));
		return parsed.success
			? { kind: 'request', request: parsed.data }
			: { kind: 'failure', error: 'invalid_client_metadata', description: issues(parsed.error) };
	} catch (error) {
		return {
			kind: 'failure',
			error: 'invalid_client_metadata',
			description: `The registration request is not JSON: ${String(error)}`
		};
	}
};

/** RFC 7591 registration, anonymous and for public clients only. */
export const POST: RequestHandler = async ({ request, url }) => {
	const read = await readRegistration(request);
	if (read.kind === 'too_large') {
		logRefusal(url.pathname, 'too_large');
		return json(
			{
				error: 'invalid_client_metadata',
				error_description: `The registration request is larger than ${requestBodyLimits().oauthRegistration} bytes.`
			},
			{ status: 413, headers: cors }
		);
	}
	if (read.kind === 'failure') {
		logRefusal(url.pathname, read.error);
		return refuse(read);
	}

	const client = await AppFactory.mcpAuthorization().registerClient(read.request);
	if ('kind' in client) return refuse(client);
	return json(
		{
			client_id: client.clientId,
			client_name: client.name,
			redirect_uris: client.redirectUris,
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code']
		},
		{ status: 201, headers: cors }
	);
};

export const OPTIONS: RequestHandler = () =>
	new Response(null, {
		headers: {
			...cors,
			'access-control-allow-headers': 'content-type',
			'access-control-allow-methods': 'POST'
		}
	});

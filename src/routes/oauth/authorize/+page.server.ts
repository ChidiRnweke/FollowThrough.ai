import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import {
	authorizationParametersSchema,
	authorizationTargetSchema,
	type AuthorizationRequest,
	type OAuthFailure
} from '$lib/models/mcp-authorization';
import { AppFactory } from '$lib/server/factories/app-factory';
import type { Actions, PageServerLoad } from './$types';

const scopeSchema = z.enum(['read', 'full']);

const invalid = (description: string): OAuthFailure => ({
	kind: 'failure',
	error: 'invalid_request',
	description
});

/**
 * Every failure on this page is shown to the user rather than sent to the redirect URI:
 * a request that does not parse has no redirect URI that is known to be the client's.
 */
const parseRequest = (query: URLSearchParams): AuthorizationRequest | OAuthFailure => {
	const fields = Object.fromEntries(query);
	const target = authorizationTargetSchema.safeParse(fields);
	if (!target.success) return invalid('The request has no client_id or redirect_uri.');
	const parameters = authorizationParametersSchema.safeParse(fields);
	if (!parameters.success)
		return invalid(
			`The request is not a PKCE authorization code request for a resource: ${parameters.error.issues
				.map((issue) => issue.path.join('.'))
				.join(', ')}.`
		);
	return { target: target.data, ...parameters.data };
};

const mcpResource = (url: URL): string => new URL('/mcp', url.origin).href;

export const load: PageServerLoad = async ({ url }) => {
	const request = parseRequest(url.searchParams);
	if ('kind' in request) return { outcome: request };
	const reviewed = await AppFactory.mcpAuthorization().review(request, mcpResource(url));
	if (reviewed.kind === 'failure') return { outcome: reviewed };
	// A metadata document URL is vouched for by its host; a registered client named itself.
	const clientId = reviewed.client.clientId;
	return {
		outcome: {
			kind: 'consent' as const,
			clientName: reviewed.client.name,
			vouchedBy: clientId.startsWith('https://') ? new URL(clientId).host : undefined,
			requestedScope: reviewed.requestedScope
		}
	};
};

export const actions: Actions = {
	approve: async ({ url, request, locals }) => {
		const scope = scopeSchema.safeParse((await request.formData()).get('scope'));
		if (!scope.success) return fail(400, { description: 'Choose read-only or full access.' });
		const parsed = parseRequest(url.searchParams);
		if ('kind' in parsed) return fail(400, { description: parsed.description });
		const result = await AppFactory.access(AppFactory.actor(locals)).approveMcpClient(
			parsed,
			scope.data,
			mcpResource(url)
		);
		if (result.kind === 'failure') return fail(400, { description: result.description });
		redirect(303, result.location, { external: true });
	},
	deny: async ({ url }) => {
		const parsed = parseRequest(url.searchParams);
		if ('kind' in parsed) return fail(400, { description: parsed.description });
		const result = await AppFactory.mcpAuthorization().deny(parsed, mcpResource(url));
		if (result.kind === 'failure') return fail(400, { description: result.description });
		redirect(303, result.location, { external: true });
	}
};

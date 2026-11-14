import { json } from '@sveltejs/kit';
import { MCP_WIRE_SCOPES } from '$lib/models/mcp-authorization';
import type { RequestHandler } from './$types';

// Browser-based MCP clients read discovery documents cross-origin; they carry no credentials.
const cors = { 'access-control-allow-origin': '*' };

/** RFC 8414 metadata. Every client is public, so PKCE is the only proof of possession. */
export const GET: RequestHandler = ({ url }) =>
	json(
		{
			issuer: url.origin,
			authorization_endpoint: new URL('/oauth/authorize', url.origin).href,
			token_endpoint: new URL('/oauth/token', url.origin).href,
			registration_endpoint: new URL('/oauth/register', url.origin).href,
			response_types_supported: ['code'],
			grant_types_supported: ['authorization_code', 'refresh_token'],
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['none'],
			scopes_supported: Object.values(MCP_WIRE_SCOPES),
			client_id_metadata_document_supported: true
		},
		{ headers: cors }
	);

export const OPTIONS: RequestHandler = () =>
	new Response(null, {
		headers: { ...cors, 'access-control-allow-headers': 'mcp-protocol-version' }
	});

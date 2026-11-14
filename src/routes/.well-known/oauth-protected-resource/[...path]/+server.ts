import { error, json } from '@sveltejs/kit';
import { MCP_WIRE_SCOPES } from '$lib/models/mcp-authorization';
import type { RequestHandler } from './$types';

// Browser-based MCP clients read discovery documents cross-origin; they carry no credentials.
const cors = { 'access-control-allow-origin': '*' };

/**
 * RFC 9728 protected resource metadata for `/mcp`. It is served at the well-known root and
 * with the resource path appended, because clients try both.
 */
export const GET: RequestHandler = ({ params, url }) => {
	if (params.path !== '' && params.path !== 'mcp') error(404, 'Not found');
	return json(
		{
			resource: new URL('/mcp', url.origin).href,
			authorization_servers: [url.origin],
			scopes_supported: Object.values(MCP_WIRE_SCOPES),
			bearer_methods_supported: ['header'],
			resource_name: 'FollowThrough'
		},
		{ headers: cors }
	);
};

export const OPTIONS: RequestHandler = () =>
	new Response(null, {
		headers: { ...cors, 'access-control-allow-headers': 'mcp-protocol-version' }
	});

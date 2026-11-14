// chisel-ignore-file error-flow:raw-http-status -- MCP bearer authentication and JSON-RPC method negotiation require protocol-level 401 and 405 responses.
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { RequestHandler } from './$types';
import { AppFactory } from '$lib/server/factories/app-factory';

/**
 * RFC 9728 §5.1: the challenge names the protected resource metadata, which is how a client
 * finds the authorization server with nothing but this URL.
 */
const unauthorized = (url: URL): Response =>
	new Response(
		JSON.stringify({
			error: 'invalid_token',
			error_description: 'Connect this client through OAuth to get an access token.'
		}),
		{
			status: 401,
			headers: {
				'content-type': 'application/json',
				'www-authenticate': `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp', url.origin).href}"`
			}
		}
	);

/** Every MCP request requires an access token issued for this endpoint; its account and scope define access. */
const authenticate = async (request: Request, url: URL) => {
	const verified = await AppFactory.authentication().verifyBearer(
		request.headers.get('authorization'),
		new URL('/mcp', url.origin).href
	);
	return verified ? AppFactory.access(verified.actor).attributeMcp(verified.scope) : null;
};

export const POST: RequestHandler = async ({ request, url }) => {
	const authenticated = await authenticate(request, url);
	if (!authenticated) return unauthorized(url);

	// An MCP client has no ambient project, so the user's workspace-wide tool
	// selection is the whole story here; project overrides apply in-app only.
	const session = await AppFactory.forActor(authenticated.actor)
		.agentHarness()
		.openMcpTools(authenticated.scope, authenticated.provenanceId);
	const server = AppFactory.mcpSurface(session).open();

	// Stateless: no session to keep alive between requests, so this survives
	// process restarts and multiple instances without sticky routing.
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});

	try {
		await server.connect(transport);
		return await transport.handleRequest(request);
	} finally {
		await server.close();
	}
};

// Advertised as stateless, so there is no SSE stream to open and no session to
// delete. Answer the spec's other verbs explicitly rather than 404.
const methodNotAllowed = (): Response =>
	new Response(JSON.stringify({ error: 'method_not_allowed' }), {
		status: 405,
		headers: { 'content-type': 'application/json', allow: 'POST' }
	});

export const GET: RequestHandler = () => methodNotAllowed();
export const DELETE: RequestHandler = () => methodNotAllowed();

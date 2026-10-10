// chisel-ignore-file error-flow:raw-http-status -- MCP bearer authentication and JSON-RPC method negotiation require protocol-level 401 and 405 responses.
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { RequestHandler } from './$types';
import { AppFactory } from '$lib/server/factories/app-factory';

const unauthorized = (detail: string): Response =>
	new Response(JSON.stringify({ error: 'unauthorized', detail }), {
		status: 401,
		headers: {
			'content-type': 'application/json',
			'www-authenticate': 'Bearer realm="followthrough"'
		}
	});

/**
 * Bearer token when auth is on. With auth disabled (single-user dev) there is
 * no session token. Establish the configured local account before provenance or tool writes.
 */
const authenticate = (request: Request) =>
	AppFactory.isAuthEnabled()
		? AppFactory.access().authenticateMcp(request.headers.get('authorization'))
		: AppFactory.access().attributeLocalMcp(AppFactory.actor());

export const POST: RequestHandler = async ({ request }) => {
	const authenticated = await authenticate(request);
	if (!authenticated)
		return unauthorized('Provide a FollowThrough API token as a Bearer credential.');

	// An MCP client has no ambient project, so the user's workspace-wide tool
	// selection is the whole story here; project overrides apply in-app only.
	const controllers = AppFactory.controllers();
	const preferences = await controllers.toolPreferences().list(authenticated.actor);
	const disabled = new Set(
		preferences.filter((preference) => !preference.enabled).map((preference) => preference.name)
	);

	const server = AppFactory.mcpSurface({
		actor: authenticated.actor,
		scope: authenticated.scope,
		provenanceId: authenticated.provenanceId,
		toolAccess: { isEnabled: (toolName) => !disabled.has(toolName) }
	}).open();

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

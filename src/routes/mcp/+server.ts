// chisel-ignore-file error-flow:raw-http-status -- MCP bearer authentication and JSON-RPC method negotiation require protocol-level 401 and 405 responses.
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { RequestHandler } from './$types';
import type { ActorContext, ApiTokenScope } from '$lib/models/identity';
import { AppFactory } from '$lib/server/app-factory';
import { createMcpToolSurface } from '$lib/server/mcp-tool-factory';

const unauthorized = (detail: string): Response =>
	new Response(JSON.stringify({ error: 'unauthorized', detail }), {
		status: 401,
		headers: {
			'content-type': 'application/json',
			'www-authenticate': 'Bearer realm="followthrough"'
		}
	});

/**
 * Bearer token when auth is on. With auth disabled (single-user dev) there are
 * no users to mint tokens against, so fall through to the local actor — same
 * rule the rest of the app follows via `AppFactory.actor()`.
 */
const authenticate = async (
	request: Request
): Promise<{ actor: ActorContext; scope: ApiTokenScope } | Response> => {
	if (!AppFactory.isAuthEnabled()) return { actor: AppFactory.actor(), scope: 'full' };

	const verified = await AppFactory.accessTokens().verify(request.headers.get('authorization'));
	if (!verified) return unauthorized('Provide a FollowThrough API token as a Bearer credential.');
	return { actor: { userId: verified.user.id }, scope: verified.scope };
};

export const POST: RequestHandler = async ({ request }) => {
	const authenticated = await authenticate(request);
	if (authenticated instanceof Response) return authenticated;

	// Every write through a tool is attributable to this request.
	const provenance = await AppFactory.provenance().record(authenticated.actor, {
		producerKind: 'agent',
		producerName: 'MCP client',
		pipeline: 'agent',
		model: 'mcp',
		metadata: { scope: authenticated.scope }
	});

	// An MCP client has no ambient project, so the user's workspace-wide tool
	// selection is the whole story here; project overrides apply in-app only.
	const controllers = AppFactory.controllers();
	const preferences = await controllers.toolPreferences().list(authenticated.actor);
	const disabled = new Set(
		preferences.filter((preference) => !preference.enabled).map((preference) => preference.name)
	);

	const server = createMcpToolSurface({
		controllers,
		actor: authenticated.actor,
		scope: authenticated.scope,
		provenanceId: provenance.id,
		toolRetriever: AppFactory.toolRetriever(),
		toolAccess: { isEnabled: (toolName) => !disabled.has(toolName) }
	});

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

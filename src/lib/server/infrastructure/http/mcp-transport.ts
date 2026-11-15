import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

/**
 * The stateless transport for one `/mcp` request, answering only requests addressed to this
 * deployment. The `Host` must be the canonical origin's host, so a DNS name re-pointed at this
 * server is refused. A browser always sends `Origin`, and it must be the canonical origin.
 * Desktop and CLI clients send no `Origin`; the SDK admits a request without one, and checks a
 * present one only. Each refusal is a 403 JSON-RPC error.
 */
export const mcpTransport = (canonical: URL): WebStandardStreamableHTTPServerTransport =>
	new WebStandardStreamableHTTPServerTransport({
		// Stateless: no session to keep alive between requests, so this survives
		// process restarts and multiple instances without sticky routing.
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
		enableDnsRebindingProtection: true,
		allowedHosts: [canonical.host],
		allowedOrigins: [canonical.origin]
	});

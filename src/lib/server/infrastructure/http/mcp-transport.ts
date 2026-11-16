import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

/**
 * The stateless transport for one `/mcp` request, answering only requests addressed to this
 * deployment. The `Host` must be the canonical origin's host, so a DNS name re-pointed at this
 * server is refused with a 403 JSON-RPC error.
 *
 * `Origin` is not checked. Every request carries a bearer token in `Authorization`, which a
 * browser never attaches on its own, so a page on another origin cannot act with a user's
 * access. Hosted clients such as Claude send an `Origin` of their own, and an allowlist refused
 * every one of them.
 *
 * The transport runs after the bearer check, so each refusal comes from an authenticated client
 * and is logged at warn with the transport's reason.
 */
export const mcpTransport = (canonical: URL): WebStandardStreamableHTTPServerTransport => {
	const transport = new WebStandardStreamableHTTPServerTransport({
		// Stateless: no session to keep alive between requests, so this survives
		// process restarts and multiple instances without sticky routing.
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
		enableDnsRebindingProtection: true,
		allowedHosts: [canonical.host]
	});
	transport.onerror = (error) => console.warn(`[mcp] Request refused: ${error.message}`);
	return transport;
};

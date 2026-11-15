import type { McpScope } from '$lib/models/identity';
import type { IssuedTokens, ReviewedAuthorization } from '$lib/models/mcp-authorization';
import type { McpCodeIssuer, McpTokenExchange } from '$lib/server/services/identity/mcp-grants';

export const TEST_MCP_RESOURCE = 'https://ft.example/mcp';
export const TEST_MCP_CLIENT = 'https://claude.ai/oauth/claude-code-client-metadata';
const REDIRECT = 'http://localhost:53122/callback';
// RFC 7636 Appendix B.
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

/** A request from `clientId` that has passed review. */
export const reviewedMcpAuthorizationFor = (clientId: string): ReviewedAuthorization => ({
	kind: 'reviewed',
	client: {
		clientId,
		name: 'Claude Code',
		redirectUris: ['http://localhost/callback']
	},
	request: {
		target: { clientId, redirectUri: REDIRECT, state: undefined },
		codeChallenge: CHALLENGE,
		resource: TEST_MCP_RESOURCE,
		requestedScopes: []
	},
	requestedScope: 'read'
});

/** Approves the client as the issuer's user and exchanges the code, as the client would. */
export const connectMcpClient = async (
	grants: McpCodeIssuer,
	credentials: McpTokenExchange,
	scope: McpScope,
	clientId = TEST_MCP_CLIENT
): Promise<IssuedTokens> => {
	const code = await grants.issueCode(reviewedMcpAuthorizationFor(clientId), scope);
	const issued = await credentials.exchange(
		{
			grant: 'authorization_code',
			code,
			redirectUri: REDIRECT,
			codeVerifier: VERIFIER,
			clientId,
			resource: TEST_MCP_RESOURCE
		},
		TEST_MCP_RESOURCE
	);
	if (issued.kind === 'failure') throw new Error(issued.description);
	return issued;
};

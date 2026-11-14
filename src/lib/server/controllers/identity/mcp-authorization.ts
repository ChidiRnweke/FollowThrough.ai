import type {
	AuthorizationRedirect,
	AuthorizationRequest,
	ClientRegistrationRequest,
	IssuedTokens,
	McpClient,
	OAuthFailure,
	ReviewedAuthorization,
	TokenRequest
} from '$lib/models/mcp-authorization';
import type {
	McpClientRegistrar,
	McpClientReview
} from '$lib/server/services/identity/mcp-clients';
import type { McpTokenExchange } from '$lib/server/services/identity/mcp-grants';

/**
 * The OAuth authorization server for `/mcp`, for the steps that run before a user is known:
 * client registration, request review, refusal and token exchange. `resource` is always this
 * server's MCP URL.
 */
export interface McpAuthorizationController {
	registerClient(request: ClientRegistrationRequest): Promise<McpClient | OAuthFailure>;
	review(
		request: AuthorizationRequest,
		resource: string
	): Promise<ReviewedAuthorization | OAuthFailure>;
	/** The user refused: send `access_denied` to a request that passed review. */
	deny(
		request: AuthorizationRequest,
		resource: string
	): Promise<AuthorizationRedirect | OAuthFailure>;
	exchangeToken(request: TokenRequest, resource: string): Promise<IssuedTokens | OAuthFailure>;
}

export interface McpAuthorizationDependencies {
	readonly clients: McpClientReview & McpClientRegistrar;
	readonly credentials: McpTokenExchange;
}

export class McpAuthorization implements McpAuthorizationController {
	constructor(private readonly dependencies: McpAuthorizationDependencies) {}

	registerClient(request: ClientRegistrationRequest): Promise<McpClient | OAuthFailure> {
		return this.dependencies.clients.register(request);
	}

	review(
		request: AuthorizationRequest,
		resource: string
	): Promise<ReviewedAuthorization | OAuthFailure> {
		return this.dependencies.clients.review(request, resource);
	}

	async deny(
		request: AuthorizationRequest,
		resource: string
	): Promise<AuthorizationRedirect | OAuthFailure> {
		const reviewed = await this.dependencies.clients.review(request, resource);
		if (reviewed.kind === 'failure') return reviewed;
		return {
			kind: 'redirect',
			location: this.dependencies.clients.answer(reviewed, {
				kind: 'error',
				error: 'access_denied',
				description: 'The user refused access.'
			})
		};
	}

	exchangeToken(request: TokenRequest, resource: string): Promise<IssuedTokens | OAuthFailure> {
		return this.dependencies.credentials.exchange(request, resource);
	}
}

import {
	MCP_WIRE_SCOPES,
	type AuthorizationAnswer,
	type AuthorizationRequest,
	type ClientRegistrationRequest,
	type McpClient,
	type OAuthFailure,
	type ReviewedAuthorization
} from '$lib/models/mcp-authorization';
import type {
	ClientMetadataDocumentRepository,
	McpClientRepository
} from '$lib/server/repositories/identity';

/** Decides whether an authorization request may be answered, and how the answer is sent. */
export interface McpClientReview {
	/**
	 * Resolves the client, checks the redirect URI against it, and checks that the request is
	 * for `resource`. Every failure is shown to the user: until the redirect URI is known to be
	 * the client's, nothing is sent to it.
	 */
	review(
		request: AuthorizationRequest,
		resource: string
	): Promise<ReviewedAuthorization | OAuthFailure>;
	/** The URL that carries `answer` back to the client: the request's redirect URI and state. */
	answer(reviewed: ReviewedAuthorization, answer: AuthorizationAnswer): string;
}

export interface McpClientRegistrar {
	register(request: ClientRegistrationRequest): Promise<McpClient | OAuthFailure>;
}

/** Anonymous registrations that no client came back to. */
export interface McpClientRetention {
	/**
	 * Deletes registrations last used before `lastUsedBefore`. A registration that an unrevoked
	 * connection or an unexpired code names is kept. Returns how many were deleted.
	 */
	removeUnused(lastUsedBefore: Date): Promise<number>;
}

export interface McpClientDirectoryDependencies {
	readonly clients: McpClientRepository;
	readonly documents: ClientMetadataDocumentRepository;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Schemes a browser would run or read locally instead of handing to the client. */
const UNSAFE_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'blob:', 'about:', 'vbscript:']);

const failure = (error: OAuthFailure['error'], description: string): OAuthFailure => ({
	kind: 'failure',
	error,
	description
});

const parseUrl = (value: string): URL | null => (URL.canParse(value) ? new URL(value) : null);

// A registered redirect URI, read so that its loopback port can be ignored. Some clients
// publish a `:*` port on a loopback host to say "any port", so it is read as no port at all.
const registeredRedirect = (registered: string): URL | null =>
	parseUrl(registered.replace(/^(http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])):\*(?=[/?]|$)/, '$1'));

const isLoopback = (url: URL): boolean =>
	url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);

/**
 * Exact match, except that a loopback redirect may use any port and any loopback host name
 * (RFC 8252 §7.3): a native client listens on a port the operating system picks, and every
 * loopback name reaches the same machine.
 */
const redirectMatches = (registered: string, requested: string): boolean => {
	if (registered === requested) return true;
	const expected = registeredRedirect(registered);
	const actual = parseUrl(requested);
	if (!expected || !actual || !isLoopback(expected) || !isLoopback(actual)) return false;
	return (
		expected.pathname === actual.pathname && expected.search === actual.search && actual.hash === ''
	);
};

/** https anywhere, http only on loopback, and private-use schemes for native apps. */
const redirectProblem = (value: string): string | null => {
	const url = parseUrl(value);
	if (!url) return `${value} is not a URL`;
	if (url.hash !== '') return `${value} has a fragment`;
	if (UNSAFE_SCHEMES.has(url.protocol)) return `${value} uses a scheme that cannot receive a code`;
	if (url.protocol === 'http:' && !isLoopback(url)) return `${value} uses http off loopback`;
	return null;
};

export class McpClientDirectory implements McpClientReview, McpClientRegistrar, McpClientRetention {
	constructor(private readonly dependencies: McpClientDirectoryDependencies) {}

	async review(
		request: AuthorizationRequest,
		resource: string
	): Promise<ReviewedAuthorization | OAuthFailure> {
		const resolved = await this.resolve(request.target.clientId);
		if (resolved.kind === 'failure') return resolved;
		const { client } = resolved;
		if (!client.redirectUris.some((uri) => redirectMatches(uri, request.target.redirectUri)))
			return failure('invalid_request', 'The redirect_uri is not registered for this client.');
		if (request.resource !== resource)
			return failure('invalid_target', `This server only issues tokens for ${resource}.`);
		return {
			kind: 'reviewed',
			client,
			request,
			// Read-only unless the client asks for full access: the narrower grant is offered first.
			requestedScope: request.requestedScopes.includes(MCP_WIRE_SCOPES.full) ? 'full' : 'read'
		};
	}

	answer(reviewed: ReviewedAuthorization, answer: AuthorizationAnswer): string {
		const url = new URL(reviewed.request.target.redirectUri);
		if (answer.kind === 'code') url.searchParams.set('code', answer.code);
		else {
			url.searchParams.set('error', answer.error);
			url.searchParams.set('error_description', answer.description);
		}
		if (reviewed.request.target.state) url.searchParams.set('state', reviewed.request.target.state);
		return url.href;
	}

	async register(request: ClientRegistrationRequest): Promise<McpClient | OAuthFailure> {
		const problem = request.redirectUris.map(redirectProblem).find((found) => found !== null);
		if (problem) return failure('invalid_redirect_uri', problem);
		return this.dependencies.clients.create({
			// An unnamed client is named after where its codes go, which is what the user can check.
			name: request.name ?? new URL(request.redirectUris[0]).host,
			redirectUris: request.redirectUris
		});
	}

	removeUnused(lastUsedBefore: Date): Promise<number> {
		return this.dependencies.clients.deleteUnused(lastUsedBefore);
	}

	/** An https `client_id` is a metadata document URL; any other is a registration id. */
	private async resolve(
		clientId: string
	): Promise<{ kind: 'client'; client: McpClient } | OAuthFailure> {
		const url = parseUrl(clientId);
		if (url?.protocol === 'https:') {
			if (url.href !== clientId)
				return failure('invalid_client', 'The client_id is not a normalized URL.');
			const fetched = await this.dependencies.documents.fetch(url);
			if (fetched.kind === 'failure')
				return failure(
					'invalid_client',
					`The client metadata could not be used: ${fetched.reason}.`
				);
			return {
				kind: 'client',
				client: {
					clientId,
					name: fetched.document.client_name ?? url.host,
					redirectUris: fetched.document.redirect_uris
				}
			};
		}
		const registered = await this.dependencies.clients.find(clientId);
		if (!registered) return failure('invalid_client', 'The client_id is not registered.');
		return { kind: 'client', client: registered };
	}
}

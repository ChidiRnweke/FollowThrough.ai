import { randomBytes } from 'node:crypto';
import {
	discoverOAuthServerInfo,
	exchangeAuthorization,
	refreshAuthorization,
	registerClient,
	startAuthorization
} from '@modelcontextprotocol/sdk/client/auth.js';
import {
	checkResourceAllowed,
	resourceUrlFromServerUrl
} from '@modelcontextprotocol/sdk/shared/auth-utils.js';
import type {
	AuthorizationServerMetadata,
	OAuthClientInformationMixed,
	OAuthTokens as SdkTokens
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
	InvalidClientError,
	InvalidGrantError,
	UnauthorizedClientError
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { ExternalServiceError, ValidationError } from '$lib/errors';
import {
	authorizationServerExtensionsSchema,
	type AuthorizationChallenge,
	connectorCallbackPath,
	connectorClientMetadataPath,
	connectorClientRegistration,
	type CatalogConnectorId,
	type OAuthClient,
	type OAuthGrant,
	type OAuthTokens,
	type PendingAuthorization
} from '$lib/models/connectors';
import type { DateTime } from '$lib/models/workspace';
import { fetchUntil, OperationDeadline } from '$lib/server/infrastructure/network/deadline';
import type { FetchLike } from '$lib/server/infrastructure/network/outbound';

/** How a client is registered with the server's authorization server. */
export type Registration =
	| { readonly kind: 'discovered' }
	| { readonly kind: 'preregistered'; readonly catalogId: CatalogConnectorId };

export interface AuthorizationStart {
	readonly authorizationUrl: string;
	/** Sent to the authorization server and back; stored only as a hash. */
	readonly state: string;
	readonly grant: OAuthGrant;
	readonly codeVerifier: string;
	readonly redirectUri: string;
}

export type TokenRenewal =
	| { readonly kind: 'renewed'; readonly tokens: OAuthTokens }
	/** The authorization server refused the refresh token or the client: only the user can fix it. */
	| { readonly kind: 'rejected'; readonly reason: string };

export interface ConnectorAuthorizer {
	begin(input: {
		readonly serverUrl: string;
		readonly registration: Registration;
		readonly challenge: AuthorizationChallenge | undefined;
	}): Promise<AuthorizationStart>;
	exchange(
		pending: PendingAuthorization,
		code: string,
		issuer: string | undefined
	): Promise<OAuthTokens>;
	refresh(grant: OAuthGrant, refreshToken: string): Promise<TokenRenewal>;
}

export interface ClientCredentials {
	readonly clientId: string;
	readonly clientSecret: string;
}

export interface ConnectorAuthorizationDependencies {
	readonly fetch: FetchLike;
	/** The deployment's public origin: redirects return here, and it hosts the client metadata document. */
	readonly origin: string;
	/** Client credentials the operator configured, by catalog entry. */
	readonly preregistered: ReadonlyMap<CatalogConnectorId, ClientCredentials>;
	readonly now: () => DateTime;
	/** The total time each of begin, exchange and refresh may take (CONNECTOR_OPERATION_TIMEOUT_MS). */
	readonly operationTimeoutMs: number;
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i;

/**
 * OAuth for connectors, over the MCP SDK's discovery, registration and token
 * functions (ADR 0049). It owns the authorization server as a provider, so it
 * maps every response into connector models and every provider failure into
 * one domain error. Each operation runs within its own deadline, which every
 * request it makes carries.
 */
export class ConnectorAuthorization implements ConnectorAuthorizer {
	constructor(private readonly dependencies: ConnectorAuthorizationDependencies) {}

	async begin(input: {
		readonly serverUrl: string;
		readonly registration: Registration;
		readonly challenge: AuthorizationChallenge | undefined;
	}): Promise<AuthorizationStart> {
		const host = new URL(input.serverUrl).host;
		const deadline = new OperationDeadline(this.dependencies.operationTimeoutMs);
		const info = await this.provider(host, deadline, (fetchFn) =>
			discoverOAuthServerInfo(input.serverUrl, {
				fetchFn,
				...(input.challenge?.resourceMetadataUrl
					? { resourceMetadataUrl: new URL(input.challenge.resourceMetadataUrl) }
					: {})
			})
		);
		const metadata = info.authorizationServerMetadata;
		if (!metadata)
			throw new ExternalServiceError(
				`${host} publishes no OAuth metadata. Connect it with an access token instead.`
			);
		// MCP authorization: a server that does not advertise S256 does not support PKCE.
		if (!metadata.code_challenge_methods_supported?.includes('S256'))
			throw new ExternalServiceError(`${host}'s authorization server does not support PKCE.`);
		// The user's browser goes to this page next. The SDK refuses script schemes only, and
		// OAuth 2.1 requires TLS for the authorization endpoint.
		if (new URL(metadata.authorization_endpoint).protocol !== 'https:')
			throw new ExternalServiceError(
				`${host}'s sign-in page is not served over HTTPS, so FollowThrough will not send you to it.`
			);
		const resource = this.resource(input.serverUrl, info.resourceMetadata?.resource);
		const scopes = (
			input.challenge?.scope ??
			info.resourceMetadata?.scopes_supported?.join(' ') ??
			''
		)
			.split(' ')
			.filter((scope) => scope.length > 0);
		const client = await this.client(
			host,
			deadline,
			metadata,
			info.authorizationServerUrl,
			input.registration,
			scopes
		);
		const redirectUri = new URL(connectorCallbackPath, this.dependencies.origin).href;
		const state = randomBytes(32).toString('base64url');
		const started = await this.provider(host, deadline, () =>
			startAuthorization(info.authorizationServerUrl, {
				metadata,
				clientInformation: this.clientInformation(client),
				redirectUrl: redirectUri,
				state,
				resource,
				...(scopes.length > 0 ? { scope: scopes.join(' ') } : {})
			})
		);
		return {
			authorizationUrl: started.authorizationUrl.href,
			state,
			codeVerifier: started.codeVerifier,
			redirectUri,
			grant: {
				authorizationServer: {
					issuer: metadata.issuer,
					authorizationEndpoint: metadata.authorization_endpoint,
					tokenEndpoint: metadata.token_endpoint,
					tokenAuthMethods: metadata.token_endpoint_auth_methods_supported ?? [],
					issuerInResponse:
						authorizationServerExtensionsSchema.parse(metadata)
							.authorization_response_iss_parameter_supported === true
				},
				resource: resource.href,
				scopes,
				client
			}
		};
	}

	async exchange(
		pending: PendingAuthorization,
		code: string,
		issuer: string | undefined
	): Promise<OAuthTokens> {
		const server = pending.grant.authorizationServer;
		// RFC 9207: a server that sends `iss` names itself; a mismatch is a mix-up attack.
		if (issuer !== undefined ? issuer !== server.issuer : server.issuerInResponse)
			throw new ValidationError('The sign-in answer came from a different authorization server.');
		const deadline = new OperationDeadline(this.dependencies.operationTimeoutMs);
		const tokens = await this.provider(new URL(server.tokenEndpoint).host, deadline, (fetchFn) =>
			exchangeAuthorization(server.issuer, {
				metadata: this.metadata(pending.grant),
				clientInformation: this.clientInformation(pending.grant.client),
				authorizationCode: code,
				codeVerifier: pending.codeVerifier,
				redirectUri: pending.redirectUri,
				resource: new URL(pending.grant.resource),
				fetchFn
			})
		);
		return this.tokens(tokens, undefined);
	}

	async refresh(grant: OAuthGrant, refreshToken: string): Promise<TokenRenewal> {
		const server = grant.authorizationServer;
		const deadline = new OperationDeadline(this.dependencies.operationTimeoutMs);
		try {
			const tokens = await refreshAuthorization(server.issuer, {
				metadata: this.metadata(grant),
				clientInformation: this.clientInformation(grant.client),
				refreshToken,
				resource: new URL(grant.resource),
				fetchFn: fetchUntil(this.dependencies.fetch, deadline.signal)
			});
			return { kind: 'renewed', tokens: this.tokens(tokens, refreshToken) };
		} catch (error) {
			if (deadline.passed) throw deadline.failure(new URL(server.tokenEndpoint).host);
			if (
				error instanceof InvalidGrantError ||
				error instanceof InvalidClientError ||
				error instanceof UnauthorizedClientError
			)
				return { kind: 'rejected', reason: error.message };
			if (error instanceof ExternalServiceError) throw error;
			throw notCompleted(
				new URL(server.tokenEndpoint).host,
				error instanceof Error ? error.message : String(error)
			);
		}
	}

	private resource(serverUrl: string, advertised: string | undefined): URL {
		if (advertised === undefined) return resourceUrlFromServerUrl(serverUrl);
		if (!checkResourceAllowed({ requestedResource: serverUrl, configuredResource: advertised }))
			throw new ExternalServiceError(
				`${new URL(serverUrl).host} names a protected resource that does not contain it.`,
				{ cause: advertised }
			);
		return new URL(advertised);
	}

	private async client(
		host: string,
		deadline: OperationDeadline,
		metadata: AuthorizationServerMetadata,
		authorizationServerUrl: string,
		registration: Registration,
		scopes: readonly string[]
	): Promise<OAuthClient> {
		if (registration.kind === 'preregistered') {
			if (!this.dependencies.preregistered.has(registration.catalogId))
				throw new ValidationError(`This server has no client credentials for ${host}.`);
			return { kind: 'preregistered', catalogId: registration.catalogId };
		}
		const origin = new URL(this.dependencies.origin);
		// A metadata document must be fetchable by the authorization server, so a local origin cannot use one.
		if (
			metadata.client_id_metadata_document_supported === true &&
			origin.protocol === 'https:' &&
			!LOCAL_HOST.test(origin.hostname)
		)
			return {
				kind: 'metadata_document',
				clientId: new URL(connectorClientMetadataPath, this.dependencies.origin).href
			};
		if (!metadata.registration_endpoint)
			throw new ExternalServiceError(
				`${host} needs a client registered in advance, which FollowThrough cannot do for this server.`
			);
		const registered = await this.provider(host, deadline, (fetchFn) =>
			registerClient(authorizationServerUrl, {
				metadata,
				clientMetadata: connectorClientRegistration(
					new URL('/', this.dependencies.origin).href,
					new URL(connectorCallbackPath, this.dependencies.origin).href
				),
				fetchFn,
				...(scopes.length > 0 ? { scope: scopes.join(' ') } : {})
			})
		);
		if (registered.client_secret === undefined)
			return { kind: 'dynamic_public', clientId: registered.client_id };
		return {
			kind: 'dynamic_confidential',
			clientId: registered.client_id,
			clientSecret: registered.client_secret,
			method:
				registered.token_endpoint_auth_method === 'client_secret_post'
					? 'client_secret_post'
					: 'client_secret_basic'
		};
	}

	private clientInformation(client: OAuthClient): OAuthClientInformationMixed {
		switch (client.kind) {
			case 'metadata_document':
			case 'dynamic_public':
				return { client_id: client.clientId };
			case 'dynamic_confidential':
				return {
					client_id: client.clientId,
					client_secret: client.clientSecret,
					token_endpoint_auth_method: client.method
				};
			case 'preregistered': {
				const credentials = this.dependencies.preregistered.get(client.catalogId);
				if (!credentials)
					throw new ExternalServiceError(
						`This server no longer has client credentials for ${client.catalogId}.`
					);
				return { client_id: credentials.clientId, client_secret: credentials.clientSecret };
			}
		}
	}

	/** The metadata the token functions read, rebuilt from what the grant kept. */
	private metadata(grant: OAuthGrant): AuthorizationServerMetadata {
		const server = grant.authorizationServer;
		return {
			issuer: server.issuer,
			authorization_endpoint: server.authorizationEndpoint,
			token_endpoint: server.tokenEndpoint,
			response_types_supported: ['code'],
			token_endpoint_auth_methods_supported: [...server.tokenAuthMethods]
		};
	}

	private tokens(tokens: SdkTokens, previousRefreshToken: string | undefined): OAuthTokens {
		const refreshToken = tokens.refresh_token ?? previousRefreshToken;
		return {
			accessToken: tokens.access_token,
			expiry:
				tokens.expires_in === undefined
					? { kind: 'unstated' }
					: {
							kind: 'at',
							at: new Date(
								Date.parse(this.dependencies.now()) + tokens.expires_in * 1000
							).toISOString() as DateTime
						},
			refresh:
				refreshToken === undefined ? { kind: 'unavailable' } : { kind: 'available', refreshToken }
		};
	}

	/** Calls the provider with a fetch bound to the operation's deadline. */
	private async provider<T>(
		host: string,
		deadline: OperationDeadline,
		call: (fetch: FetchLike) => Promise<T>
	): Promise<T> {
		try {
			return await call(fetchUntil(this.dependencies.fetch, deadline.signal));
		} catch (error) {
			if (deadline.passed) throw deadline.failure(host);
			if (error instanceof ExternalServiceError || error instanceof ValidationError) throw error;
			throw notCompleted(host, error instanceof Error ? error.message : String(error));
		}
	}
}

const notCompleted = (host: string, cause: string) =>
	new ExternalServiceError(`Signing in to ${host} did not complete. Try connecting again.`, {
		cause
	});

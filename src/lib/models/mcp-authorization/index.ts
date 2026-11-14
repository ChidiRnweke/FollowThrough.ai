import { z } from 'zod';
import type { McpScope, UserId } from '$lib/models/identity';

/** The scope names a client sees on the wire. The stored scope drops the prefix. */
export const MCP_WIRE_SCOPES = { read: 'mcp:read', full: 'mcp:full' } as const satisfies Record<
	McpScope,
	string
>;

/** RFC 7636: 43 to 128 unreserved characters, for both the verifier and its S256 challenge. */
const pkceValue = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/);

/** RFC 8707 resource indicator, normalized so that it compares equal to the server's own URL. */
const resourceIndicator = z
	.string()
	.url()
	.transform((value) => new URL(value).href);

/** A client the authorization server can send a code to: resolved from CIMD or registration. */
export interface McpClient {
	readonly clientId: string;
	readonly name: string;
	readonly redirectUris: readonly string[];
}

/**
 * A Client ID Metadata Document. Only public clients are accepted, so a document that names
 * another authentication method is refused rather than downgraded.
 */
export const clientMetadataDocumentSchema = z.object({
	client_id: z.string().url(),
	client_name: z.string().trim().min(1).optional(),
	redirect_uris: z.array(z.string().min(1)).min(1),
	token_endpoint_auth_method: z.literal('none').optional()
});
export type ClientMetadataDocument = z.infer<typeof clientMetadataDocumentSchema>;

/** An RFC 7591 registration request from a public client. */
export const clientRegistrationRequestSchema = z
	.object({
		redirect_uris: z.array(z.string().url()).min(1),
		client_name: z.string().trim().min(1).max(200).optional(),
		token_endpoint_auth_method: z.literal('none').optional(),
		grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).optional(),
		response_types: z.array(z.literal('code')).optional()
	})
	.transform((request) => ({
		redirectUris: request.redirect_uris,
		name: request.client_name
	}));
export type ClientRegistrationRequest = z.output<typeof clientRegistrationRequestSchema>;

/**
 * Where an authorization answer goes. It is parsed before everything else: until the client
 * and its redirect URI are known to be valid, an error is shown to the user instead of sent.
 */
export const authorizationTargetSchema = z
	.object({
		client_id: z.string().min(1),
		redirect_uri: z.string().min(1),
		state: z.string().min(1).optional()
	})
	.transform((target) => ({
		clientId: target.client_id,
		redirectUri: target.redirect_uri,
		state: target.state
	}));
export type AuthorizationTarget = z.output<typeof authorizationTargetSchema>;

export const authorizationParametersSchema = z
	.object({
		response_type: z.literal('code'),
		code_challenge: pkceValue,
		code_challenge_method: z.literal('S256'),
		resource: resourceIndicator,
		scope: z.string().optional()
	})
	.transform((parameters) => ({
		codeChallenge: parameters.code_challenge,
		resource: parameters.resource,
		/** RFC 6749 §3.3: space-delimited. Which scope this means is decided in review. */
		requestedScopes: parameters.scope?.split(' ').filter((scope) => scope !== '') ?? []
	}));
export type AuthorizationParameters = z.output<typeof authorizationParametersSchema>;

/** A complete, valid authorization request: the target plus its PKCE and resource binding. */
export interface AuthorizationRequest extends AuthorizationParameters {
	readonly target: AuthorizationTarget;
}

/** A request the client and redirect URI both passed, ready for the user's consent. */
export interface ReviewedAuthorization {
	readonly kind: 'reviewed';
	readonly client: McpClient;
	readonly request: AuthorizationRequest;
	/** The scope the consent screen offers first. The user's choice is what is granted. */
	readonly requestedScope: McpScope;
}

export const tokenRequestSchema = z
	.discriminatedUnion('grant_type', [
		z.object({
			grant_type: z.literal('authorization_code'),
			code: z.string().min(1),
			redirect_uri: z.string().min(1),
			code_verifier: pkceValue,
			client_id: z.string().min(1),
			resource: resourceIndicator.optional()
		}),
		z.object({
			grant_type: z.literal('refresh_token'),
			refresh_token: z.string().min(1),
			client_id: z.string().min(1),
			resource: resourceIndicator.optional()
		})
	])
	.transform((request) =>
		request.grant_type === 'authorization_code'
			? {
					grant: 'authorization_code' as const,
					code: request.code,
					redirectUri: request.redirect_uri,
					codeVerifier: request.code_verifier,
					clientId: request.client_id,
					resource: request.resource
				}
			: {
					grant: 'refresh_token' as const,
					refreshToken: request.refresh_token,
					clientId: request.client_id,
					resource: request.resource
				}
	);
export type TokenRequest = z.output<typeof tokenRequestSchema>;

/** An authorization code as stored: everything the token request must match. */
export interface StoredAuthorizationCode {
	readonly userId: UserId;
	readonly clientId: string;
	readonly clientName: string;
	readonly redirectUri: string;
	readonly codeChallenge: string;
	readonly scope: McpScope;
	readonly resource: string;
	readonly expiresAt: Date;
}

export interface IssuedTokens {
	readonly kind: 'issued';
	readonly accessToken: string;
	readonly refreshToken: string;
	/** Seconds until the access token expires. */
	readonly expiresIn: number;
	readonly scope: McpScope;
}

export type OAuthErrorCode =
	| 'invalid_request'
	| 'invalid_client'
	| 'invalid_grant'
	| 'invalid_target'
	| 'invalid_client_metadata'
	| 'invalid_redirect_uri'
	| 'access_denied';

/** An OAuth error response (RFC 6749 §5.2), as a value the entry point must answer with. */
export interface OAuthFailure {
	readonly kind: 'failure';
	readonly error: OAuthErrorCode;
	readonly description: string;
}

/** Where the user's browser goes next. */
export interface AuthorizationRedirect {
	readonly kind: 'redirect';
	readonly location: string;
}

/** What the authorization endpoint sends back to the client's redirect URI. */
export type AuthorizationAnswer =
	| { readonly kind: 'code'; readonly code: string }
	| { readonly kind: 'error'; readonly error: OAuthErrorCode; readonly description: string };

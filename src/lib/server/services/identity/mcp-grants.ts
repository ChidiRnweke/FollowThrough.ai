import { createHash, randomBytes } from 'node:crypto';
import { NotFoundError } from '$lib/errors';
import type { McpConnection, McpConnectionId, McpScope, User } from '$lib/models/identity';
import type {
	IssuedTokens,
	OAuthFailure,
	ReviewedAuthorization,
	TokenRequest
} from '$lib/models/mcp-authorization';
import type {
	McpCredentialRepository,
	McpGrantRepository,
	TokenPairHashes
} from '$lib/server/repositories/identity';

/** Long enough for a client to post the code back; RFC 6749 §4.1.2 recommends at most 10 minutes. */
const CODE_LIFETIME_MS = 60_000;
const ACCESS_LIFETIME_SECONDS = 3_600;

/** Prefixes tell our credentials apart from each other and from anything else in a config. */
const PREFIX = { code: 'ftc_', access: 'fta_', refresh: 'ftr_' } as const;

const secret = (prefix: string): string => `${prefix}${randomBytes(32).toString('base64url')}`;

/**
 * Codes and tokens are high-entropy random strings, not passwords, so a single sha256 is the
 * right primitive: the stored value is not reversible and the lookup stays an index read.
 */
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

/** RFC 7636 §4.6: BASE64URL(SHA256(code_verifier)). */
const s256 = (verifier: string): string =>
	createHash('sha256').update(verifier).digest('base64url');

const invalidGrant = (description: string): OAuthFailure => ({
	kind: 'failure',
	error: 'invalid_grant',
	description
});

const newTokenPair = (
	now: number
): { tokens: Omit<IssuedTokens, 'scope'>; hashes: TokenPairHashes } => {
	const accessToken = secret(PREFIX.access);
	const refreshToken = secret(PREFIX.refresh);
	return {
		tokens: { kind: 'issued', accessToken, refreshToken, expiresIn: ACCESS_LIFETIME_SECONDS },
		hashes: {
			accessTokenHash: hash(accessToken),
			accessExpiresAt: new Date(now + ACCESS_LIFETIME_SECONDS * 1_000),
			refreshTokenHash: hash(refreshToken)
		}
	};
};

const bearerToken = (header: string | null): string | null => {
	if (!header) return null;
	const [scheme, ...rest] = header.trim().split(/\s+/);
	if (scheme.toLowerCase() !== 'bearer' || rest.length !== 1) return null;
	return rest[0].startsWith(PREFIX.access) ? rest[0] : null;
};

/** Issues authorization codes for the signed-in user. */
export interface McpCodeIssuer {
	/** Returns the plaintext code; only its hash is stored. */
	issueCode(reviewed: ReviewedAuthorization, scope: McpScope): Promise<string>;
}

/** The user's authorized MCP clients. */
export interface McpConnectionLedger {
	list(): Promise<readonly McpConnection[]>;
	revoke(id: McpConnectionId): Promise<Pick<McpConnection, 'id' | 'clientName'>>;
}

export class McpGrants implements McpCodeIssuer, McpConnectionLedger {
	constructor(private readonly grants: McpGrantRepository) {}

	async issueCode(reviewed: ReviewedAuthorization, scope: McpScope): Promise<string> {
		const code = secret(PREFIX.code);
		const stored = await this.grants.createCode({
			codeHash: hash(code),
			clientId: reviewed.client.clientId,
			clientName: reviewed.client.name,
			redirectUri: reviewed.request.target.redirectUri,
			codeChallenge: reviewed.request.codeChallenge,
			scope,
			resource: reviewed.request.resource,
			expiresAt: new Date(Date.now() + CODE_LIFETIME_MS)
		});
		if (stored === 'unregistered')
			throw new NotFoundError(
				'This MCP client registration has expired. Connect the client again to register it.'
			);
		return code;
	}

	list(): Promise<readonly McpConnection[]> {
		return this.grants.listConnections();
	}

	async revoke(id: McpConnectionId): Promise<Pick<McpConnection, 'id' | 'clientName'>> {
		const connection = await this.grants.revokeConnection(id);
		if (!connection) throw new NotFoundError('MCP connection not found');
		return { id: connection.id, clientName: connection.clientName };
	}
}

export interface VerifiedMcpCredential {
	readonly user: User;
	readonly scope: McpScope;
	readonly connectionId: McpConnectionId;
}

/** The token endpoint: codes and refresh tokens in, token pairs out. */
export interface McpTokenExchange {
	/** `resource` is this server's MCP URL; a request for any other resource is refused. */
	exchange(request: TokenRequest, resource: string): Promise<IssuedTokens | OAuthFailure>;
}

/** Bearer credentials checked before any user is known. */
export interface McpBearerVerifier {
	/** Takes the raw `Authorization` header; returns null for anything unusable at `resource`. */
	verify(
		authorizationHeader: string | null,
		resource: string
	): Promise<VerifiedMcpCredential | null>;
}

export class McpCredentials implements McpTokenExchange, McpBearerVerifier {
	constructor(private readonly credentials: McpCredentialRepository) {}

	async exchange(request: TokenRequest, resource: string): Promise<IssuedTokens | OAuthFailure> {
		if (request.resource !== undefined && request.resource !== resource)
			return {
				kind: 'failure',
				error: 'invalid_target',
				description: `This server only issues tokens for ${resource}.`
			};
		return request.grant === 'authorization_code'
			? this.exchangeCode(request)
			: this.refresh(request);
	}

	async verify(
		authorizationHeader: string | null,
		resource: string
	): Promise<VerifiedMcpCredential | null> {
		const token = bearerToken(authorizationHeader);
		if (!token) return null;
		const found = await this.credentials.findByAccessHash(hash(token));
		if (!found) return null;
		if (Date.now() >= found.accessExpiresAt.getTime()) return null;
		// RFC 8707: a token is only good for the resource it was issued for.
		if (found.resource !== resource) return null;
		// A token is only as good as the account behind it: approval gating in
		// `hooks.server.ts` must not be bypassable through a client.
		if (found.user.role === 'WAITING') return null;

		// Best-effort: a failed bookkeeping write must not fail the request.
		// chisel-ignore fail-loudly:silent-catch -- authentication already succeeded; failed usage bookkeeping is reported without denying the valid request.
		void this.credentials
			.touchLastUsed(found.connection.id, new Date())
			.catch((error) => console.warn('Could not update MCP connection last-used timestamp', error));

		return { user: found.user, scope: found.connection.scope, connectionId: found.connection.id };
	}

	private async exchangeCode(
		request: Extract<TokenRequest, { grant: 'authorization_code' }>
	): Promise<IssuedTokens | OAuthFailure> {
		// Consuming deletes the code, so a replayed code finds nothing.
		const code = await this.credentials.consumeCode(hash(request.code));
		if (!code) return invalidGrant('The code is unknown or was already used.');
		const now = Date.now();
		if (now >= code.expiresAt.getTime()) return invalidGrant('The code has expired.');
		if (code.clientId !== request.clientId)
			return invalidGrant('The code was issued to another client.');
		if (code.redirectUri !== request.redirectUri)
			return invalidGrant('The redirect_uri does not match the authorization request.');
		if (s256(request.codeVerifier) !== code.codeChallenge)
			return invalidGrant('The code_verifier does not match the code_challenge.');

		const pair = newTokenPair(now);
		await this.credentials.createConnection({ code, ...pair.hashes });
		return { ...pair.tokens, scope: code.scope };
	}

	private async refresh(
		request: Extract<TokenRequest, { grant: 'refresh_token' }>
	): Promise<IssuedTokens | OAuthFailure> {
		const presented = hash(request.refreshToken);
		const found = await this.credentials.findByRefreshHash(presented);
		if (!found) {
			// OAuth 2.1 §4.3.1: a rotated-out refresh token coming back means it leaked, so the
			// connection it belonged to stops working for everyone holding it.
			await this.credentials.revokeByPreviousRefreshHash(presented);
			return invalidGrant('The refresh token is unknown, revoked or already used.');
		}
		if (found.connection.clientId !== request.clientId)
			return invalidGrant('The refresh token was issued to another client.');
		if (found.user.role === 'WAITING') return invalidGrant('The account is waiting for approval.');

		const pair = newTokenPair(Date.now());
		const rotated = await this.credentials.rotate(found.connection.id, presented, pair.hashes);
		if (!rotated) return invalidGrant('The refresh token was already used.');
		return { ...pair.tokens, scope: found.connection.scope };
	}
}

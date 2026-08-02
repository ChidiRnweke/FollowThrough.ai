type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type UserId = Brand<string, 'UserId'>;

export type SessionId = Brand<string, 'SessionId'>;

export type ApiTokenId = Brand<string, 'ApiTokenId'>;

type DateTime = Brand<string, 'DateTime'>;

type Url = Brand<string, 'Url'>;

export type UserRole = 'USER' | 'ADMIN' | 'WAITING';

export interface ActorContext {
	readonly userId: UserId;
}

export type ApiTokenScope = 'read' | 'full';

/** An account. `role` gates admin surfaces and `WAITING` blocks sign-in for users pending approval. */
export interface User {
	readonly id: UserId;
	readonly email: string;
	readonly displayName: string;
	readonly avatarUrl?: Url;
	readonly role: UserRole;
	readonly authProvider?: string;
	readonly authProviderId?: string;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

/** A signed-in browser session, created after the OAuth2/OIDC callback completes. Unrelated to `ApiToken`, which authenticates MCP instead. */
export interface Session {
	readonly id: SessionId;
	readonly userId: UserId;
	readonly expiresAt: Date;
	readonly createdAt: DateTime;
}

/**
 * A bearer credential for the MCP endpoint. Never carries the plaintext token —
 * that exists only in the return value of `AccessTokens.mint`.
 */
export interface ApiToken {
	readonly id: ApiTokenId;
	readonly userId: UserId;
	readonly name: string;
	readonly scope: ApiTokenScope;
	readonly lastUsedAt?: DateTime;
	readonly expiresAt?: DateTime;
	readonly revokedAt?: DateTime;
	readonly createdAt: DateTime;
}

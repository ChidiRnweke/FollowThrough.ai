import type { ApiToken, ApiTokenId, ApiTokenScope, User } from '$lib/models/identity';

/** A new token for the bound user. */
export interface CreateApiTokenData {
	name: string;
	/** sha256 of the plaintext token. The plaintext is never persisted. */
	tokenHash: string;
	scope: ApiTokenScope;
	expiresAt?: Date;
}

export interface ApiTokenRepository {
	create(data: CreateApiTokenData): Promise<ApiToken>;
	listForUser(): Promise<readonly ApiToken[]>;
	revoke(id: ApiTokenId): Promise<ApiToken | undefined>;
}

/** Bearer credential lookups, before any user is known. */
export interface ApiTokenCredentialRepository {
	/**
	 * Looked up by hash on every MCP request, so it returns the owner in the
	 * same round trip — the caller needs the user to build an `ActorContext`.
	 */
	findByHashWithUser(tokenHash: string): Promise<{ user: User; token: ApiToken } | null>;
	touchLastUsed(id: ApiTokenId, at: Date): Promise<void>;
}

import type {
	ActorContext,
	ApiToken,
	ApiTokenId,
	ApiTokenScope,
	User,
	UserId
} from '$lib/models/identity';

export interface CreateApiTokenData {
	userId: UserId;
	name: string;
	/** sha256 of the plaintext token. The plaintext is never persisted. */
	tokenHash: string;
	scope: ApiTokenScope;
	expiresAt?: Date;
}

export interface ApiTokenRepository {
	create(data: CreateApiTokenData): Promise<ApiToken>;
	/**
	 * Looked up by hash on every MCP request, so it returns the owner in the
	 * same round trip — the caller needs the user to build an `ActorContext`.
	 */
	findByHashWithUser(tokenHash: string): Promise<{ user: User; token: ApiToken } | null>;
	listForUser(actor: ActorContext): Promise<readonly ApiToken[]>;
	revoke(actor: ActorContext, id: ApiTokenId): Promise<void>;
	touchLastUsed(id: ApiTokenId, at: Date): Promise<void>;
}

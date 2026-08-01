import type { ActorContext, ApiToken, ApiTokenId, User, UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { ApiTokenRepository, CreateApiTokenData } from '$lib/server/repositories/identity';

const instant = (value: Date): DateTime => value.toISOString() as DateTime;

export class InMemoryApiTokenRepository implements ApiTokenRepository {
	private readonly tokens: ApiToken[] = [];
	private readonly hashes = new Map<string, ApiTokenId>();
	private sequence = 0;

	constructor(private readonly users: readonly User[]) {}

	async create(data: CreateApiTokenData): Promise<ApiToken> {
		const token: ApiToken = {
			id: `token-${++this.sequence}` as ApiTokenId,
			userId: data.userId,
			name: data.name,
			scope: data.scope,
			createdAt: instant(new Date()),
			...(data.expiresAt ? { expiresAt: instant(data.expiresAt) } : {})
		};
		this.tokens.push(token);
		this.hashes.set(data.tokenHash, token.id);
		return token;
	}

	async findByHashWithUser(tokenHash: string): Promise<{ user: User; token: ApiToken } | null> {
		const id = this.hashes.get(tokenHash);
		const token = this.tokens.find((candidate) => candidate.id === id);
		if (!token) return null;
		const user = this.users.find((candidate) => candidate.id === token.userId);
		return user ? { user, token } : null;
	}

	async listForUser(actor: ActorContext): Promise<readonly ApiToken[]> {
		return this.tokens.filter((token) => token.userId === actor.userId && !token.revokedAt);
	}

	async revoke(actor: ActorContext, id: ApiTokenId): Promise<void> {
		this.replace(id, (token) =>
			token.userId === actor.userId ? { ...token, revokedAt: instant(new Date()) } : token
		);
	}

	async touchLastUsed(id: ApiTokenId, at: Date): Promise<void> {
		this.replace(id, (token) => ({ ...token, lastUsedAt: instant(at) }));
	}

	/** Lets a test age a token past its expiry without waiting. */
	expire(id: ApiTokenId, at: Date): void {
		this.replace(id, (token) => ({ ...token, expiresAt: instant(at) }));
	}

	private replace(id: ApiTokenId, update: (token: ApiToken) => ApiToken): void {
		const index = this.tokens.findIndex((token) => token.id === id);
		if (index >= 0) this.tokens[index] = update(this.tokens[index]);
	}
}

export const testTokenUser = (userId: UserId, overrides: Partial<User> = {}): User => ({
	id: userId,
	email: 'user@example.com',
	displayName: 'Test User',
	role: 'USER',
	createdAt: instant(new Date()),
	updatedAt: instant(new Date()),
	...overrides
});

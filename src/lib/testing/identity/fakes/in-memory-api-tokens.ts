import type { ActorContext, ApiToken, ApiTokenId, User, UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type {
	ApiTokenCredentialRepository,
	ApiTokenRepository,
	CreateApiTokenData
} from '$lib/server/repositories/identity';

const instant = (value: Date): DateTime => value.toISOString() as DateTime;

/** The tokens table: the bound user's tokens, and credential lookups across every user. */
export class InMemoryApiTokenRepository
	implements ApiTokenRepository, ApiTokenCredentialRepository
{
	private readonly tokens: ApiToken[];
	private readonly hashes: Map<string, ApiTokenId>;
	private readonly sequence: { next: number };

	constructor(
		private readonly actor: ActorContext,
		private readonly users: readonly User[],
		table: { tokens: ApiToken[]; hashes: Map<string, ApiTokenId>; sequence: { next: number } } = {
			tokens: [],
			hashes: new Map(),
			sequence: { next: 0 }
		}
	) {
		this.tokens = table.tokens;
		this.hashes = table.hashes;
		this.sequence = table.sequence;
	}

	/** The same table seen by another user, as a second request would see it. */
	boundTo(actor: ActorContext): InMemoryApiTokenRepository {
		return new InMemoryApiTokenRepository(actor, this.users, {
			tokens: this.tokens,
			hashes: this.hashes,
			sequence: this.sequence
		});
	}

	async create(data: CreateApiTokenData): Promise<ApiToken> {
		const token: ApiToken = {
			id: `00000000-0000-4000-8000-${String(++this.sequence.next).padStart(12, '0')}` as ApiTokenId,
			userId: this.actor.userId,
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

	async listForUser(): Promise<readonly ApiToken[]> {
		return this.tokens.filter((token) => token.userId === this.actor.userId && !token.revokedAt);
	}

	async revoke(id: ApiTokenId): Promise<ApiToken | undefined> {
		this.replace(id, (token) =>
			token.userId === this.actor.userId ? { ...token, revokedAt: instant(new Date()) } : token
		);
		return this.tokens.find((token) => token.id === id && token.userId === this.actor.userId);
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

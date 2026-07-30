import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ActorContext, ApiToken, ApiTokenId, User } from '$lib/models';
import type { ApiTokenRepository, CreateApiTokenData } from '$lib/server/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toApiToken, toUser } from '$lib/server/db/mappers';

export class ApiTokenRecords implements ApiTokenRepository {
	constructor(private readonly database: Database) {}

	async create(data: CreateApiTokenData): Promise<ApiToken> {
		const [row] = await this.database
			.insert(schema.apiTokens)
			.values({
				userId: data.userId,
				name: data.name,
				tokenHash: data.tokenHash,
				scope: data.scope,
				expiresAt: data.expiresAt ?? null
			})
			.returning();
		return toApiToken(row);
	}

	async findByHashWithUser(tokenHash: string): Promise<{ user: User; token: ApiToken } | null> {
		const rows = await this.database
			.select()
			.from(schema.apiTokens)
			.innerJoin(schema.users, eq(schema.apiTokens.userId, schema.users.id))
			.where(eq(schema.apiTokens.tokenHash, tokenHash));

		if (rows.length === 0) return null;
		return { user: toUser(rows[0].users), token: toApiToken(rows[0].api_tokens) };
	}

	async listForUser(actor: ActorContext): Promise<readonly ApiToken[]> {
		const rows = await this.database
			.select()
			.from(schema.apiTokens)
			.where(and(eq(schema.apiTokens.userId, actor.userId), isNull(schema.apiTokens.revokedAt)))
			.orderBy(desc(schema.apiTokens.createdAt));
		return rows.map(toApiToken);
	}

	async revoke(actor: ActorContext, id: ApiTokenId): Promise<void> {
		await this.database
			.update(schema.apiTokens)
			.set({ revokedAt: new Date() })
			.where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, actor.userId)));
	}

	async touchLastUsed(id: ApiTokenId, at: Date): Promise<void> {
		await this.database
			.update(schema.apiTokens)
			.set({ lastUsedAt: at })
			.where(eq(schema.apiTokens.id, id));
	}
}

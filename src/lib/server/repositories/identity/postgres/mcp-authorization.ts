import { and, desc, eq, gt, isNull, lt, notExists, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActorContext, McpConnection, McpConnectionId } from '$lib/models/identity';
import type { McpClient, StoredAuthorizationCode } from '$lib/models/mcp-authorization';
import type {
	ActiveMcpConnection,
	McpClientRepository,
	McpCredentialRepository,
	McpGrantRepository,
	NewAuthorizationCode,
	NewMcpConnection,
	TokenPairHashes
} from '$lib/server/repositories/identity';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/identity';
import { toMcpConnection, toUser } from '$lib/server/db/mappers';

const registrationId = z.string().uuid();

const toMcpClient = (row: typeof schema.mcpClients.$inferSelect): McpClient => ({
	clientId: row.id,
	name: row.clientName,
	redirectUris: row.redirectUris
});

const toStoredCode = (
	row: typeof schema.mcpAuthorizationCodes.$inferSelect
): StoredAuthorizationCode => ({
	userId: row.userId as StoredAuthorizationCode['userId'],
	clientId: row.clientId,
	clientName: row.clientName,
	redirectUri: row.redirectUri,
	codeChallenge: row.codeChallenge,
	scope: row.scope,
	resource: row.resource,
	expiresAt: row.expiresAt
});

export class McpClientRecords implements McpClientRepository {
	constructor(private readonly database: Database) {}

	async create(client: { name: string; redirectUris: readonly string[] }): Promise<McpClient> {
		const [row] = await this.database
			.insert(schema.mcpClients)
			.values({ clientName: client.name, redirectUris: [...client.redirectUris] })
			.returning();
		return toMcpClient(row);
	}

	async find(clientId: string): Promise<McpClient | null> {
		// A metadata document URL or a made-up id is not a registration id; Postgres would
		// reject it as a uuid rather than find nothing.
		if (!registrationId.safeParse(clientId).success) return null;
		const [row] = await this.database
			.select()
			.from(schema.mcpClients)
			.where(eq(schema.mcpClients.id, clientId));
		return row ? toMcpClient(row) : null;
	}

	async deleteUnused(lastUsedBefore: Date): Promise<number> {
		// Codes and connections name a client by text, since a metadata document URL is also a
		// client id; a registration is named by its uuid's text form.
		const clientIdText = sql`${schema.mcpClients.id}::text`;
		const rows = await this.database
			.delete(schema.mcpClients)
			.where(
				and(
					lt(schema.mcpClients.lastUsedAt, lastUsedBefore),
					notExists(
						this.database
							.select({ one: sql`1` })
							.from(schema.mcpConnections)
							.where(
								and(
									eq(schema.mcpConnections.clientId, clientIdText),
									isNull(schema.mcpConnections.revokedAt)
								)
							)
					),
					notExists(
						this.database
							.select({ one: sql`1` })
							.from(schema.mcpAuthorizationCodes)
							.where(
								and(
									eq(schema.mcpAuthorizationCodes.clientId, clientIdText),
									gt(schema.mcpAuthorizationCodes.expiresAt, sql`now()`)
								)
							)
					)
				)
			)
			.returning({ id: schema.mcpClients.id });
		return rows.length;
	}
}

export class McpGrantRecords implements McpGrantRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database
	) {}

	async createCode(code: NewAuthorizationCode): Promise<'created' | 'unregistered'> {
		return this.database.transaction(async (tx) => {
			// Codes that were never exchanged expire unused; remove them as new ones arrive.
			await tx
				.delete(schema.mcpAuthorizationCodes)
				.where(lt(schema.mcpAuthorizationCodes.expiresAt, new Date()));
			// A metadata document URL names no registration, and Postgres would refuse it as a uuid.
			if (registrationId.safeParse(code.clientId).success) {
				const used = await tx
					.update(schema.mcpClients)
					.set({ lastUsedAt: new Date() })
					.where(eq(schema.mcpClients.id, code.clientId))
					.returning({ id: schema.mcpClients.id });
				if (used.length === 0) return 'unregistered';
			}
			await tx.insert(schema.mcpAuthorizationCodes).values({
				codeHash: code.codeHash,
				userId: this.actor.userId,
				clientId: code.clientId,
				clientName: code.clientName,
				redirectUri: code.redirectUri,
				codeChallenge: code.codeChallenge,
				scope: code.scope,
				resource: code.resource,
				expiresAt: code.expiresAt
			});
			return 'created';
		});
	}

	async listConnections(): Promise<readonly McpConnection[]> {
		const rows = await this.database
			.select()
			.from(schema.mcpConnections)
			.where(
				and(
					eq(schema.mcpConnections.userId, this.actor.userId),
					isNull(schema.mcpConnections.revokedAt)
				)
			)
			.orderBy(desc(schema.mcpConnections.createdAt));
		return rows.map(toMcpConnection);
	}

	async revokeConnection(id: McpConnectionId): Promise<McpConnection | undefined> {
		const [row] = await this.database
			.update(schema.mcpConnections)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(schema.mcpConnections.id, id),
					eq(schema.mcpConnections.userId, this.actor.userId),
					isNull(schema.mcpConnections.revokedAt)
				)
			)
			.returning();
		return row ? toMcpConnection(row) : undefined;
	}
}

export class McpCredentialRecords implements McpCredentialRepository {
	constructor(private readonly database: Database) {}

	async consumeCode(codeHash: string): Promise<StoredAuthorizationCode | null> {
		const [row] = await this.database
			.delete(schema.mcpAuthorizationCodes)
			.where(eq(schema.mcpAuthorizationCodes.codeHash, codeHash))
			.returning();
		return row ? toStoredCode(row) : null;
	}

	async createConnection(connection: NewMcpConnection): Promise<McpConnection> {
		const [row] = await this.database
			.insert(schema.mcpConnections)
			.values({
				userId: connection.code.userId,
				clientId: connection.code.clientId,
				clientName: connection.code.clientName,
				scope: connection.code.scope,
				resource: connection.code.resource,
				accessTokenHash: connection.accessTokenHash,
				accessExpiresAt: connection.accessExpiresAt,
				refreshTokenHash: connection.refreshTokenHash
			})
			.returning();
		return toMcpConnection(row);
	}

	findByAccessHash(accessTokenHash: string): Promise<ActiveMcpConnection | null> {
		return this.findActive(eq(schema.mcpConnections.accessTokenHash, accessTokenHash));
	}

	findByRefreshHash(refreshTokenHash: string): Promise<ActiveMcpConnection | null> {
		return this.findActive(eq(schema.mcpConnections.refreshTokenHash, refreshTokenHash));
	}

	async rotate(
		id: McpConnectionId,
		refreshTokenHash: string,
		next: TokenPairHashes
	): Promise<boolean> {
		const rows = await this.database
			.update(schema.mcpConnections)
			.set({
				accessTokenHash: next.accessTokenHash,
				accessExpiresAt: next.accessExpiresAt,
				refreshTokenHash: next.refreshTokenHash,
				previousRefreshTokenHash: refreshTokenHash
			})
			.where(
				and(
					eq(schema.mcpConnections.id, id),
					eq(schema.mcpConnections.refreshTokenHash, refreshTokenHash),
					isNull(schema.mcpConnections.revokedAt)
				)
			)
			.returning({ id: schema.mcpConnections.id });
		return rows.length === 1;
	}

	async revokeByPreviousRefreshHash(refreshTokenHash: string): Promise<boolean> {
		const rows = await this.database
			.update(schema.mcpConnections)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(schema.mcpConnections.previousRefreshTokenHash, refreshTokenHash),
					isNull(schema.mcpConnections.revokedAt)
				)
			)
			.returning({ id: schema.mcpConnections.id });
		return rows.length > 0;
	}

	async touchLastUsed(id: McpConnectionId, at: Date): Promise<void> {
		await this.database
			.update(schema.mcpConnections)
			.set({ lastUsedAt: at })
			.where(eq(schema.mcpConnections.id, id));
	}

	private async findActive(match: ReturnType<typeof eq>): Promise<ActiveMcpConnection | null> {
		const [row] = await this.database
			.select()
			.from(schema.mcpConnections)
			.innerJoin(schema.users, eq(schema.mcpConnections.userId, schema.users.id))
			.where(and(match, isNull(schema.mcpConnections.revokedAt)));
		if (!row) return null;
		return {
			user: toUser(row.users),
			connection: toMcpConnection(row.mcp_connections),
			resource: row.mcp_connections.resource,
			accessExpiresAt: row.mcp_connections.accessExpiresAt
		};
	}
}

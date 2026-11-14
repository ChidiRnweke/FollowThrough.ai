import type { ActorContext, McpConnection, McpConnectionId, User } from '$lib/models/identity';
import type { McpClient, StoredAuthorizationCode } from '$lib/models/mcp-authorization';
import type { DateTime } from '$lib/models/workspace';
import type {
	ActiveMcpConnection,
	ClientMetadataDocumentRepository,
	ClientMetadataFetch,
	McpClientRepository,
	McpCredentialRepository,
	McpGrantRepository,
	NewAuthorizationCode,
	NewMcpConnection,
	TokenPairHashes
} from '$lib/server/repositories/identity';

const instant = (value: Date): DateTime => value.toISOString() as DateTime;
const id = (next: number): string => `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;

interface StoredConnection extends TokenPairHashes {
	readonly connection: McpConnection;
	readonly resource: string;
	readonly previousRefreshTokenHash: string | undefined;
	readonly revoked: boolean;
}

interface Tables {
	readonly clients: McpClient[];
	readonly codes: Map<string, StoredAuthorizationCode>;
	readonly connections: StoredConnection[];
	readonly sequence: { next: number };
}

/**
 * The MCP authorization tables: clients, codes and connections, seen by the bound user and by
 * the credential lookups that run before any user is known.
 */
export class InMemoryMcpAuthorizationRepository
	implements McpClientRepository, McpGrantRepository, McpCredentialRepository
{
	constructor(
		private readonly actor: ActorContext,
		private readonly users: readonly User[],
		private readonly tables: Tables = {
			clients: [],
			codes: new Map(),
			connections: [],
			sequence: { next: 0 }
		}
	) {}

	/** The same tables seen by another user, as a second request would see them. */
	boundTo(actor: ActorContext): InMemoryMcpAuthorizationRepository {
		return new InMemoryMcpAuthorizationRepository(actor, this.users, this.tables);
	}

	async create(client: { name: string; redirectUris: readonly string[] }): Promise<McpClient> {
		const created = { clientId: id(++this.tables.sequence.next), ...client };
		this.tables.clients.push(created);
		return created;
	}

	async find(clientId: string): Promise<McpClient | null> {
		return this.tables.clients.find((client) => client.clientId === clientId) ?? null;
	}

	async createCode(code: NewAuthorizationCode): Promise<void> {
		const { codeHash, ...stored } = code;
		this.tables.codes.set(codeHash, { ...stored, userId: this.actor.userId });
	}

	async listConnections(): Promise<readonly McpConnection[]> {
		return this.tables.connections
			.filter((row) => row.connection.userId === this.actor.userId && !row.revoked)
			.map((row) => row.connection)
			.reverse();
	}

	async revokeConnection(connectionId: McpConnectionId): Promise<McpConnection | undefined> {
		const row = this.tables.connections.find(
			(candidate) =>
				candidate.connection.id === connectionId &&
				candidate.connection.userId === this.actor.userId &&
				!candidate.revoked
		);
		if (!row) return undefined;
		this.replace(connectionId, { revoked: true });
		return row.connection;
	}

	async consumeCode(codeHash: string): Promise<StoredAuthorizationCode | null> {
		const code = this.tables.codes.get(codeHash) ?? null;
		this.tables.codes.delete(codeHash);
		return code;
	}

	async createConnection(connection: NewMcpConnection): Promise<McpConnection> {
		const created: McpConnection = {
			id: id(++this.tables.sequence.next) as McpConnectionId,
			userId: connection.code.userId,
			clientId: connection.code.clientId,
			clientName: connection.code.clientName,
			scope: connection.code.scope,
			createdAt: instant(new Date())
		};
		this.tables.connections.push({
			connection: created,
			resource: connection.code.resource,
			accessTokenHash: connection.accessTokenHash,
			accessExpiresAt: connection.accessExpiresAt,
			refreshTokenHash: connection.refreshTokenHash,
			previousRefreshTokenHash: undefined,
			revoked: false
		});
		return created;
	}

	async findByAccessHash(accessTokenHash: string): Promise<ActiveMcpConnection | null> {
		return this.active((row) => row.accessTokenHash === accessTokenHash);
	}

	async findByRefreshHash(refreshTokenHash: string): Promise<ActiveMcpConnection | null> {
		return this.active((row) => row.refreshTokenHash === refreshTokenHash);
	}

	async rotate(
		connectionId: McpConnectionId,
		refreshTokenHash: string,
		next: TokenPairHashes
	): Promise<boolean> {
		const row = this.tables.connections.find(
			(candidate) =>
				candidate.connection.id === connectionId &&
				candidate.refreshTokenHash === refreshTokenHash &&
				!candidate.revoked
		);
		if (!row) return false;
		this.replace(connectionId, { ...next, previousRefreshTokenHash: refreshTokenHash });
		return true;
	}

	async revokeByPreviousRefreshHash(refreshTokenHash: string): Promise<boolean> {
		const row = this.tables.connections.find(
			(candidate) => candidate.previousRefreshTokenHash === refreshTokenHash && !candidate.revoked
		);
		if (!row) return false;
		this.replace(row.connection.id, { revoked: true });
		return true;
	}

	async touchLastUsed(connectionId: McpConnectionId, at: Date): Promise<void> {
		const row = this.tables.connections.find(
			(candidate) => candidate.connection.id === connectionId
		);
		if (row)
			this.replace(connectionId, { connection: { ...row.connection, lastUsedAt: instant(at) } });
	}

	/** Lets a test age every access token past its expiry without waiting. */
	expireAccessTokens(at: Date): void {
		for (const row of this.tables.connections)
			this.replace(row.connection.id, { accessExpiresAt: at });
	}

	/** Lets a test age every unexchanged code past its expiry without waiting. */
	expireCodes(at: Date): void {
		for (const [hash, code] of this.tables.codes)
			this.tables.codes.set(hash, { ...code, expiresAt: at });
	}

	private active(match: (row: StoredConnection) => boolean): ActiveMcpConnection | null {
		const row = this.tables.connections.find((candidate) => match(candidate) && !candidate.revoked);
		if (!row) return null;
		const user = this.users.find((candidate) => candidate.id === row.connection.userId);
		if (!user) throw new Error('The connection user is missing');
		return {
			user,
			connection: row.connection,
			resource: row.resource,
			accessExpiresAt: row.accessExpiresAt
		};
	}

	private replace(connectionId: McpConnectionId, update: Partial<StoredConnection>): void {
		const index = this.tables.connections.findIndex((row) => row.connection.id === connectionId);
		this.tables.connections[index] = { ...this.tables.connections[index], ...update };
	}
}

/** Client ID Metadata Documents served from a fixed table of URL to fetch result. */
export class StaticClientMetadataDocuments implements ClientMetadataDocumentRepository {
	constructor(private readonly documents: ReadonlyMap<string, ClientMetadataFetch>) {}

	async fetch(url: URL): Promise<ClientMetadataFetch> {
		return (
			this.documents.get(url.href) ?? {
				kind: 'failure',
				reason: 'the metadata document answered 404'
			}
		);
	}
}

export const testMcpUser = (userId: User['id'], overrides: Partial<User> = {}): User => ({
	id: userId,
	email: 'user@example.com',
	displayName: 'Test User',
	role: 'USER',
	createdAt: instant(new Date()),
	updatedAt: instant(new Date()),
	...overrides
});

import type { McpConnection, McpConnectionId, User } from '$lib/models/identity';
import type {
	ClientMetadataDocument,
	McpClient,
	StoredAuthorizationCode
} from '$lib/models/mcp-authorization';

/** Clients that registered anonymously. Read before any user is known. */
export interface McpClientRepository {
	create(client: { name: string; redirectUris: readonly string[] }): Promise<McpClient>;
	/** Null for an id that was never issued, including one that is not a registration id. */
	find(clientId: string): Promise<McpClient | null>;
	/**
	 * Deletes registrations last used before `lastUsedBefore` that no unrevoked connection and
	 * no unexpired code names, in one statement. Returns how many were deleted.
	 */
	deleteUnused(lastUsedBefore: Date): Promise<number>;
}

export type ClientMetadataFetch =
	| { readonly kind: 'document'; readonly document: ClientMetadataDocument }
	| { readonly kind: 'failure'; readonly reason: string };

/** Client ID Metadata Documents, fetched from the URL a client gives as its `client_id`. */
export interface ClientMetadataDocumentRepository {
	fetch(url: URL): Promise<ClientMetadataFetch>;
}

/** A new authorization code for the bound user. `codeHash` is the sha256 of the code. */
export type NewAuthorizationCode = Omit<StoredAuthorizationCode, 'userId'> & {
	readonly codeHash: string;
};

/** The bound user's codes and connections. */
export interface McpGrantRepository {
	/**
	 * Stores the code and marks its client's registration, if it has one, as used now. A
	 * registration that is gone (swept after the client was reviewed) stores nothing.
	 */
	createCode(code: NewAuthorizationCode): Promise<'created' | 'unregistered'>;
	/** Connections that are not revoked, newest first. */
	listConnections(): Promise<readonly McpConnection[]>;
	revokeConnection(id: McpConnectionId): Promise<McpConnection | undefined>;
}

/** The hashes and lifetime of one access and refresh token pair. */
export interface TokenPairHashes {
	readonly accessTokenHash: string;
	readonly accessExpiresAt: Date;
	readonly refreshTokenHash: string;
}

export interface NewMcpConnection extends TokenPairHashes {
	readonly code: StoredAuthorizationCode;
}

/** A connection that is not revoked, found through one of its token hashes. */
export interface ActiveMcpConnection {
	readonly user: User;
	readonly connection: McpConnection;
	readonly resource: string;
	readonly accessExpiresAt: Date;
}

/** Token exchange and bearer lookups, before any user is known. */
export interface McpCredentialRepository {
	/** Deletes and returns the code, so a second exchange of the same code finds nothing. */
	consumeCode(codeHash: string): Promise<StoredAuthorizationCode | null>;
	createConnection(connection: NewMcpConnection): Promise<McpConnection>;
	findByAccessHash(accessTokenHash: string): Promise<ActiveMcpConnection | null>;
	findByRefreshHash(refreshTokenHash: string): Promise<ActiveMcpConnection | null>;
	/**
	 * Replaces the token pair only while `refreshTokenHash` is still current. Returns false when
	 * another request rotated or revoked the connection first.
	 */
	rotate(id: McpConnectionId, refreshTokenHash: string, next: TokenPairHashes): Promise<boolean>;
	/** Revokes the connection whose previous refresh token this is. Returns whether one existed. */
	revokeByPreviousRefreshHash(refreshTokenHash: string): Promise<boolean>;
	touchLastUsed(id: McpConnectionId, at: Date): Promise<void>;
}

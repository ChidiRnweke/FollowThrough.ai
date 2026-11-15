import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type UserId = Brand<string, 'UserId'>;

export type SessionId = Brand<string, 'SessionId'>;

/** A session id is this many random bytes, hex-encoded: 256 bits, so an id cannot be guessed. */
export const SESSION_ID_BYTES = 32;

/** Admits only lowercase hex of `SESSION_ID_BYTES`, so a malformed cookie is refused unread. */
export const sessionIdSchema = z
	.string()
	.regex(new RegExp(`^[0-9a-f]{${SESSION_ID_BYTES * 2}}$`))
	.transform((value) => value as SessionId);

export type McpConnectionId = Brand<string, 'McpConnectionId'>;

type DateTime = Brand<string, 'DateTime'>;

type Url = Brand<string, 'Url'>;

export type UserRole = 'USER' | 'ADMIN' | 'WAITING';

/**
 * The user's non-agent preferences. Sparse: an absent field defers to the
 * deployment default rather than pinning "off", so a shipped default reaches
 * users who never touched the setting.
 */
export interface UserPreferences {
	/** App-level default for H1–H4 section numbering in documents. */
	readonly sectionNumberingDefault?: boolean;
}

export interface UpdateUserPreferencesInput {
	readonly sectionNumberingDefault?: boolean;
}

export interface ActorContext {
	readonly userId: UserId;
}

/** What an MCP client may do: `read` reaches read tools only; `full` reaches every enabled tool. */
export type McpScope = 'read' | 'full';

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

/** A signed-in browser session, created after the OAuth2/OIDC callback completes. Unrelated to `McpConnection`, which authenticates MCP instead. */
export interface Session {
	readonly id: SessionId;
	readonly userId: UserId;
	readonly expiresAt: Date;
	readonly createdAt: DateTime;
}

/**
 * An MCP client the user authorized through OAuth. Never carries a credential — only hashes
 * of its tokens are stored. `clientId` is the client's metadata document URL or the id it
 * received at registration.
 */
export interface McpConnection {
	readonly id: McpConnectionId;
	readonly userId: UserId;
	readonly clientId: string;
	readonly clientName: string;
	readonly scope: McpScope;
	readonly lastUsedAt?: DateTime;
	readonly createdAt: DateTime;
}

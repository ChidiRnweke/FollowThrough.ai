import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type UserId = Brand<string, 'UserId'>;

/**
 * The secret a browser holds in its session cookie. It is never stored: the session row is keyed
 * by its digest, `SessionId`, so a copy of the table signs nobody in.
 */
export type SessionToken = Brand<string, 'SessionToken'>;

/** A session token is this many random bytes, hex-encoded: 256 bits, so it cannot be guessed. */
export const SESSION_TOKEN_BYTES = 32;

/** Admits only lowercase hex of `SESSION_TOKEN_BYTES`, so a malformed cookie is refused unread. */
export const sessionTokenSchema = z
	.string()
	.regex(new RegExp(`^[0-9a-f]{${SESSION_TOKEN_BYTES * 2}}$`))
	.transform((value) => value as SessionToken);

/**
 * A session's stored key: the lowercase hex SHA-256 digest of its token. It is an opaque id, safe
 * to show the browser, because it cannot be turned back into the token.
 */
export type SessionId = Brand<string, 'SessionId'>;

/** A SHA-256 digest is 32 bytes, so its hex form is 64 lowercase hex digits. */
export const sessionIdSchema = z
	.string()
	.regex(/^[0-9a-f]{64}$/)
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
	/** Absent until the session is first renewed. */
	readonly lastRenewedAt?: DateTime;
}

/** A session the user holds, as Settings lists it. `current` marks the browser that asks. */
export interface SignedInBrowser {
	readonly id: SessionId;
	readonly createdAt: DateTime;
	readonly lastRenewedAt?: DateTime;
	/** The earlier of the renewable deadline and the absolute lifetime cap. */
	readonly expiresAt: Date;
	readonly current: boolean;
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

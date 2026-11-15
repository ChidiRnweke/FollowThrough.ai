import type { Session, SessionId, User, UserId } from '$lib/models/identity';

export interface CreateSessionData {
	id: SessionId;
	userId: UserId;
	createdAt: Date;
	expiresAt: Date;
}

/** Browser sign-in sessions created after the OAuth2/OIDC callback. Separate from `McpCredentialRepository`, which authenticates MCP instead. */
export interface SessionRepository {
	create(data: CreateSessionData): Promise<Session>;
	findByIdWithUser(sessionId: SessionId): Promise<{ user: User; session: Session } | null>;
	delete(sessionId: SessionId): Promise<void>;
	/** Moves the deadline and records `renewedAt` as the session's last renewal. */
	renew(sessionId: SessionId, expiresAt: Date, renewedAt: Date): Promise<void>;
}

/** The bound user's own browser sessions, as Settings lists and ends them. */
export interface UserSessionRepository {
	/** Every session row of the bound user, newest first, including expired rows not yet removed. */
	list(): Promise<readonly Session[]>;
	/** Deletes the bound user's session; false when the user holds no session with this id. */
	delete(sessionId: SessionId): Promise<boolean>;
	/** Deletes every session of the bound user except `kept`, and answers how many it deleted. */
	deleteAllExcept(kept: SessionId): Promise<number>;
}

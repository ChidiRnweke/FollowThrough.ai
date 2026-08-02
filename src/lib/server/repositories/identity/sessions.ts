import type { Session, SessionId, User, UserId } from '$lib/models/identity';

export interface CreateSessionData {
	id: SessionId;
	userId: UserId;
	expiresAt: Date;
}

/** Browser sign-in sessions created after the OAuth2/OIDC callback. Separate from `ApiTokenRepository`, which authenticates MCP instead. */
export interface SessionRepository {
	create(data: CreateSessionData): Promise<Session>;
	findByIdWithUser(sessionId: SessionId): Promise<{ user: User; session: Session } | null>;
	delete(sessionId: SessionId): Promise<void>;
	updateExpiresAt(sessionId: SessionId, expiresAt: Date): Promise<void>;
}

import type { Session, SessionId, User, UserId } from '../models';

export interface CreateSessionData {
	id: SessionId;
	userId: UserId;
	expiresAt: Date;
}

export interface SessionRepository {
	create(data: CreateSessionData): Promise<Session>;
	findByIdWithUser(sessionId: SessionId): Promise<{ user: User; session: Session } | null>;
	delete(sessionId: SessionId): Promise<void>;
	updateExpiresAt(sessionId: SessionId, expiresAt: Date): Promise<void>;
}

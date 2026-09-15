import type { Session, SessionId, User } from '$lib/models/identity';
import type { CreateSessionData, SessionRepository } from '$lib/server/repositories/identity';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';

export class InMemorySessionRepository implements SessionRepository {
	readonly sessions = new Map<SessionId, Session>();
	users: User[] = [];
	failure?: 'read' | 'write' | 'delete';
	async create(data: CreateSessionData): Promise<Session> {
		if (this.failure === 'write') throw new Error('Session storage unavailable');
		if (!this.users.some((user) => user.id === data.userId))
			throw new Error('Session user is missing');
		const session = { ...data, createdAt: testNow };
		this.sessions.set(session.id, structuredClone(session));
		return structuredClone(session);
	}
	async findByIdWithUser(id: SessionId): Promise<{ user: User; session: Session } | null> {
		if (this.failure === 'read') throw new Error('Session storage unavailable');
		const session = this.sessions.get(id);
		if (!session) return null;
		const user = this.users.find((user) => user.id === session.userId);
		if (!user) throw new Error('Session user is missing');
		return structuredClone({ user, session });
	}
	async delete(id: SessionId): Promise<void> {
		if (this.failure === 'delete') throw new Error('Session storage unavailable');
		this.sessions.delete(id);
	}
	async updateExpiresAt(id: SessionId, expiresAt: Date): Promise<void> {
		if (this.failure === 'write') throw new Error('Session storage unavailable');
		const session = this.sessions.get(id);
		if (!session) throw new Error('Session is missing');
		this.sessions.set(id, { ...session, expiresAt });
	}
}

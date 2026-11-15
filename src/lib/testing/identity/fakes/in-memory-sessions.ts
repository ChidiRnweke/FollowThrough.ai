import type { ActorContext, Session, SessionId, User } from '$lib/models/identity';
import type {
	CreateSessionData,
	SessionRepository,
	UserSessionRepository
} from '$lib/server/repositories/identity';
import type { DateTime } from '$lib/models/workspace';

const instant = (value: Date): DateTime => value.toISOString() as DateTime;

export class InMemorySessionRepository implements SessionRepository {
	readonly sessions = new Map<SessionId, Session>();
	users: User[] = [];
	failure?: 'read' | 'write' | 'delete';
	async create(data: CreateSessionData): Promise<Session> {
		if (this.failure === 'write') throw new Error('Session storage unavailable');
		if (!this.users.some((user) => user.id === data.userId))
			throw new Error('Session user is missing');
		const session: Session = {
			id: data.id,
			userId: data.userId,
			expiresAt: data.expiresAt,
			createdAt: instant(data.createdAt)
		};
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
	async renew(id: SessionId, expiresAt: Date, renewedAt: Date): Promise<void> {
		if (this.failure === 'write') throw new Error('Session storage unavailable');
		const session = this.sessions.get(id);
		if (!session) throw new Error('Session is missing');
		this.sessions.set(id, { ...session, expiresAt, lastRenewedAt: instant(renewedAt) });
	}

	/** The same rows, seen as `actor`'s own sessions. */
	forUser(actor: ActorContext): UserSessionRepository {
		const own = () => [...this.sessions.values()].filter(({ userId }) => userId === actor.userId);
		return {
			list: async () => {
				if (this.failure === 'read') throw new Error('Session storage unavailable');
				return structuredClone(
					own().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
				);
			},
			delete: async (id) => {
				if (this.failure === 'delete') throw new Error('Session storage unavailable');
				if (!own().some((session) => session.id === id)) return false;
				return this.sessions.delete(id);
			},
			deleteAllExcept: async (kept) => {
				if (this.failure === 'delete') throw new Error('Session storage unavailable');
				const removed = own().filter(({ id }) => id !== kept);
				for (const { id } of removed) this.sessions.delete(id);
				return removed.length;
			}
		};
	}
}

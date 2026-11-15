import { and, desc, eq, ne } from 'drizzle-orm';
import type { ActorContext, Session, SessionId, User } from '$lib/models/identity';
import type {
	CreateSessionData,
	SessionRepository,
	UserSessionRepository
} from '$lib/server/repositories/identity';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/identity';
import { toSession, toUser } from '$lib/server/db/mappers';

export class SessionRecords implements SessionRepository {
	constructor(private readonly database: Database) {}

	async create(data: CreateSessionData): Promise<Session> {
		const [row] = await this.database
			.insert(schema.sessions)
			.values({
				id: data.id,
				userId: data.userId,
				createdAt: data.createdAt,
				expiresAt: data.expiresAt
			})
			.returning();
		return toSession(row);
	}

	async findByIdWithUser(sessionId: SessionId): Promise<{ user: User; session: Session } | null> {
		const rows = await this.database
			.select()
			.from(schema.sessions)
			.innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
			.where(eq(schema.sessions.id, sessionId));

		if (rows.length === 0) return null;

		const row = rows[0];
		return {
			user: toUser(row.users),
			session: toSession(row.sessions)
		};
	}

	async delete(sessionId: SessionId): Promise<void> {
		await this.database.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
	}

	async renew(sessionId: SessionId, expiresAt: Date, renewedAt: Date): Promise<void> {
		await this.database
			.update(schema.sessions)
			.set({ expiresAt, lastRenewedAt: renewedAt })
			.where(eq(schema.sessions.id, sessionId));
	}
}

export class UserSessionRecords implements UserSessionRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database
	) {}

	async list(): Promise<readonly Session[]> {
		const rows = await this.database
			.select()
			.from(schema.sessions)
			.where(eq(schema.sessions.userId, this.actor.userId))
			.orderBy(desc(schema.sessions.createdAt));
		return rows.map(toSession);
	}

	async delete(sessionId: SessionId): Promise<boolean> {
		const deleted = await this.database
			.delete(schema.sessions)
			.where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, this.actor.userId)))
			.returning({ id: schema.sessions.id });
		return deleted.length > 0;
	}

	async deleteAllExcept(kept: SessionId): Promise<number> {
		const deleted = await this.database
			.delete(schema.sessions)
			.where(and(eq(schema.sessions.userId, this.actor.userId), ne(schema.sessions.id, kept)))
			.returning({ id: schema.sessions.id });
		return deleted.length;
	}
}

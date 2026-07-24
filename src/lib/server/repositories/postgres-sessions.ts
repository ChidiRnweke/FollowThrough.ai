import { eq } from 'drizzle-orm';
import type { Session, SessionId, User } from '$lib/models';
import type { CreateSessionData, SessionRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toSession, toUser } from '../domain/mappers';

export class PostgresSessionRepository implements SessionRepository {
	constructor(private readonly database: Database) {}

	async create(data: CreateSessionData): Promise<Session> {
		const [row] = await this.database
			.insert(schema.sessions)
			.values({
				id: data.id,
				userId: data.userId,
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

	async updateExpiresAt(sessionId: SessionId, expiresAt: Date): Promise<void> {
		await this.database
			.update(schema.sessions)
			.set({ expiresAt })
			.where(eq(schema.sessions.id, sessionId));
	}
}

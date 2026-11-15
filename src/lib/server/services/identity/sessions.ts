import { randomBytes } from 'node:crypto';
import {
	SESSION_ID_BYTES,
	type Session,
	type SessionId,
	type User,
	type UserId
} from '$lib/models/identity';
import type { SessionRepository } from '$lib/server/repositories/identity';

export interface ISessionRegistry {
	logout(sessionId: SessionId): Promise<void>;
	validateSession(sessionId: SessionId): Promise<{ user: User; session: Session } | null>;
	createSession(userId: UserId): Promise<Session>;
}

/** Lowercase hex of `SESSION_ID_BYTES` random bytes: the only shape `sessionIdSchema` admits. */
const newSessionId = (): SessionId => randomBytes(SESSION_ID_BYTES).toString('hex') as SessionId;

export class SessionRegistry implements ISessionRegistry {
	constructor(
		private readonly sessionRepo: SessionRepository,
		private readonly now: () => number = Date.now
	) {}

	async logout(sessionId: SessionId): Promise<void> {
		await this.sessionRepo.delete(sessionId);
	}

	async validateSession(sessionId: SessionId): Promise<{ user: User; session: Session } | null> {
		const result = await this.sessionRepo.findByIdWithUser(sessionId);

		if (!result) {
			return null;
		}

		const now = this.now();
		if (now >= result.session.expiresAt.getTime()) {
			await this.sessionRepo.delete(sessionId);
			return null;
		}

		// Extend session if close to expiring (within 15 days)
		const fifteenDays = 1000 * 60 * 60 * 24 * 15;
		if (now >= result.session.expiresAt.getTime() - fifteenDays) {
			const newExpiresAt = new Date(now + 1000 * 60 * 60 * 24 * 30); // 30 days
			await this.sessionRepo.updateExpiresAt(sessionId, newExpiresAt);
			result.session = { ...result.session, expiresAt: newExpiresAt };
		}

		return result;
	}

	async createSession(userId: UserId): Promise<Session> {
		const sessionId = newSessionId();
		const expiresAt = new Date(this.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

		return await this.sessionRepo.create({
			id: sessionId,
			userId,
			expiresAt
		});
	}
}

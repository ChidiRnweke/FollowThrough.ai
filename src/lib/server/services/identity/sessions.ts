import type { Session, SessionId, User, UserId } from '$lib/models';
import type { SessionRepository } from '$lib/server/repositories';

export interface ISessionRegistry {
	logout(sessionId: string): Promise<void>;
	validateSession(sessionId: string): Promise<{ user: User; session: Session } | null>;
	createSession(userId: UserId): Promise<Session>;
}

function generateSessionId(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export class SessionRegistry implements ISessionRegistry {
	constructor(private sessionRepo: SessionRepository) {}

	async logout(sessionId: string): Promise<void> {
		await this.sessionRepo.delete(sessionId as SessionId);
	}

	async validateSession(sessionId: string): Promise<{ user: User; session: Session } | null> {
		const result = await this.sessionRepo.findByIdWithUser(sessionId as SessionId);

		if (!result) {
			return null;
		}

		// Check expiration
		if (Date.now() >= result.session.expiresAt.getTime()) {
			await this.sessionRepo.delete(sessionId as SessionId);
			return null;
		}

		// Extend session if close to expiring (within 15 days)
		const fifteenDays = 1000 * 60 * 60 * 24 * 15;
		if (Date.now() >= result.session.expiresAt.getTime() - fifteenDays) {
			const newExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
			await this.sessionRepo.updateExpiresAt(sessionId as SessionId, newExpiresAt);
			result.session = { ...result.session, expiresAt: newExpiresAt };
		}

		return result;
	}

	async createSession(userId: UserId): Promise<Session> {
		const sessionId = generateSessionId() as SessionId;
		const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

		return await this.sessionRepo.create({
			id: sessionId,
			userId,
			expiresAt
		});
	}
}

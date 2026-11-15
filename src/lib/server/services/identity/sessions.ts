import { randomBytes } from 'node:crypto';
import { NotFoundError } from '$lib/errors';
import {
	SESSION_TOKEN_BYTES,
	type Session,
	type SessionId,
	type SessionToken,
	type SignedInBrowser,
	type User,
	type UserId
} from '$lib/models/identity';
import type { SessionRepository, UserSessionRepository } from '$lib/server/repositories/identity';
import { sha256Hex } from '$lib/server/infrastructure/crypto/digest';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A new session, and each renewal, admits the browser for this long. */
const RENEWAL_PERIOD_MS = 30 * DAY_MS;
/** A session is renewed once it is used this close to its deadline. */
const RENEWAL_WINDOW_MS = 15 * DAY_MS;

/** How long a session may last in total, from sign-in, however often it is renewed. */
export interface SessionLifetime {
	readonly maxLifetimeMs: number;
}

/** What sign-in hands the browser: the token for its cookie, and the session stored for it. */
export interface IssuedSession {
	readonly token: SessionToken;
	readonly session: Session;
}

/** Lowercase hex of `SESSION_TOKEN_BYTES` random bytes: the only shape `sessionTokenSchema` admits. */
const newSessionToken = (): SessionToken =>
	randomBytes(SESSION_TOKEN_BYTES).toString('hex') as SessionToken;

/** The stored key of the session a token opens. */
const sessionIdOf = (token: SessionToken): SessionId => sha256Hex(token) as SessionId;

/** When a session stops admitting: its deadline, but never past its absolute lifetime. */
const endOf = (session: Session, lifetime: SessionLifetime): number =>
	Math.min(session.expiresAt.getTime(), Date.parse(session.createdAt) + lifetime.maxLifetimeMs);

export interface ISessionRegistry {
	logout(token: SessionToken): Promise<void>;
	validateSession(token: SessionToken): Promise<{ user: User; session: Session } | null>;
	createSession(userId: UserId): Promise<IssuedSession>;
}

export class SessionRegistry implements ISessionRegistry {
	constructor(
		private readonly sessionRepo: SessionRepository,
		private readonly lifetime: SessionLifetime,
		private readonly now: () => number = Date.now
	) {}

	async logout(token: SessionToken): Promise<void> {
		await this.sessionRepo.delete(sessionIdOf(token));
	}

	async validateSession(token: SessionToken): Promise<{ user: User; session: Session } | null> {
		const sessionId = sessionIdOf(token);
		const result = await this.sessionRepo.findByIdWithUser(sessionId);

		if (!result) {
			return null;
		}

		const now = this.now();
		if (now >= endOf(result.session, this.lifetime)) {
			await this.sessionRepo.delete(sessionId);
			return null;
		}

		// Renew a session used close to its deadline, but never past its absolute lifetime. A
		// session already at that cap has nothing left to renew, so it is left unchanged.
		const { expiresAt, createdAt } = result.session;
		if (now >= expiresAt.getTime() - RENEWAL_WINDOW_MS) {
			const renewedUntil = Math.min(
				now + RENEWAL_PERIOD_MS,
				Date.parse(createdAt) + this.lifetime.maxLifetimeMs
			);
			if (renewedUntil > expiresAt.getTime()) {
				const newExpiresAt = new Date(renewedUntil);
				const renewedAt = new Date(now);
				await this.sessionRepo.renew(sessionId, newExpiresAt, renewedAt);
				result.session = {
					...result.session,
					expiresAt: newExpiresAt,
					lastRenewedAt: renewedAt.toISOString() as Session['createdAt']
				};
			}
		}

		return result;
	}

	async createSession(userId: UserId): Promise<IssuedSession> {
		const token = newSessionToken();
		const now = this.now();
		const session = await this.sessionRepo.create({
			id: sessionIdOf(token),
			userId,
			createdAt: new Date(now),
			expiresAt: new Date(now + Math.min(RENEWAL_PERIOD_MS, this.lifetime.maxLifetimeMs))
		});
		return { token, session };
	}
}

/** The bound user's signed-in browsers, as Settings shows and ends them. */
export interface SignedInBrowserLedger {
	/** Sessions that still admit a browser, with `current` set on the one `current` opens. */
	list(current: SessionToken): Promise<readonly SignedInBrowser[]>;
	/** Ends one of the user's sessions. Throws `NotFoundError` when the user holds no such session. */
	signOut(id: SessionId): Promise<void>;
	/** Ends every session of the user except the one `current` opens; answers how many ended. */
	signOutOthers(current: SessionToken): Promise<number>;
}

export class SignedInBrowserDirectory implements SignedInBrowserLedger {
	constructor(
		private readonly sessions: UserSessionRepository,
		private readonly lifetime: SessionLifetime,
		private readonly now: () => number = Date.now
	) {}

	async list(current: SessionToken): Promise<readonly SignedInBrowser[]> {
		const currentId = sessionIdOf(current);
		const now = this.now();
		return (await this.sessions.list()).flatMap((session): SignedInBrowser[] => {
			const end = endOf(session, this.lifetime);
			if (now >= end) return [];
			return [
				{
					id: session.id,
					createdAt: session.createdAt,
					lastRenewedAt: session.lastRenewedAt,
					expiresAt: new Date(end),
					current: session.id === currentId
				}
			];
		});
	}

	async signOut(id: SessionId): Promise<void> {
		if (!(await this.sessions.delete(id)))
			throw new NotFoundError('That browser is already signed out.');
	}

	signOutOthers(current: SessionToken): Promise<number> {
		return this.sessions.deleteAllExcept(sessionIdOf(current));
	}
}

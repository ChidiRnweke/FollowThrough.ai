import type { InlineSuggestionAdmission } from '$lib/models/agent';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { InlineAttemptRepository } from '$lib/server/repositories/inline-suggestions/attempts';

const WINDOW_MS = 60_000;

export interface InlineAdmission {
	/** Spends one completion from the user's per-minute budget, or says when one frees up. */
	consume(userId: UserId, now: number): Promise<InlineSuggestionAdmission>;
}

/** Proactive completions are capped per user per rolling minute, across every server process. */
export class InlineAdmissionService implements InlineAdmission {
	constructor(
		private readonly attempts: InlineAttemptRepository,
		private readonly requestsPerMinute = 40
	) {}

	async consume(userId: UserId, now: number): Promise<InlineSuggestionAdmission> {
		const reservation = await this.attempts.reserve(
			userId,
			new Date(now).toISOString() as DateTime,
			new Date(now - WINDOW_MS).toISOString() as DateTime,
			this.requestsPerMinute
		);
		if (reservation.kind === 'reserved') return { allowed: true };
		return {
			allowed: false,
			reason: 'rate_limited',
			retryAfterMs: Math.max(1, WINDOW_MS - (now - Date.parse(reservation.oldest)))
		};
	}
}

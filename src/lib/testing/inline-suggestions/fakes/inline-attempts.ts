import type { InlineBudgetReservation } from '$lib/models/agent';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { InlineAttemptRepository } from '$lib/server/repositories/inline-suggestions/attempts';

export class InMemoryInlineAttempts implements InlineAttemptRepository {
	readonly attempts: { readonly userId: UserId; readonly at: DateTime }[] = [];

	async reserve(
		userId: UserId,
		at: DateTime,
		since: DateTime,
		limit: number
	): Promise<InlineBudgetReservation> {
		const counted = this.attempts
			.filter((attempt) => attempt.userId === userId && attempt.at > since)
			.map((attempt) => attempt.at)
			.sort();
		const oldest = counted[0];
		if (oldest && counted.length >= limit) return { kind: 'exhausted', oldest };
		this.attempts.push({ userId, at });
		return { kind: 'reserved' };
	}
}

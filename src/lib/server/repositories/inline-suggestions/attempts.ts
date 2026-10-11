import type { InlineBudgetReservation } from '$lib/models/agent';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';

export interface InlineAttemptRepository {
	/**
	 * Records an attempt at `at` when fewer than `limit` attempts were made since `since`.
	 * Concurrent reservations for one user are serialized, so the limit holds exactly.
	 */
	reserve(
		userId: UserId,
		at: DateTime,
		since: DateTime,
		limit: number
	): Promise<InlineBudgetReservation>;
}

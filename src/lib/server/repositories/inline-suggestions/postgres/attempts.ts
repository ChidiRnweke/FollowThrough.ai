import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import type { InlineBudgetReservation } from '$lib/models/agent';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { InlineAttemptRepository } from '$lib/server/repositories/inline-suggestions/attempts';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/inline-suggestions';

export class InlineAttemptRecords implements InlineAttemptRepository {
	constructor(private readonly db: Database) {}

	reserve(
		userId: UserId,
		at: DateTime,
		since: DateTime,
		limit: number
	): Promise<InlineBudgetReservation> {
		const attempts = schema.inlineCompletionAttempts;
		return this.db.transaction(async (transaction) => {
			await transaction.execute(
				sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext('inline-completion-budget'))`
			);
			await transaction
				.delete(attempts)
				.where(and(eq(attempts.userId, userId), lte(attempts.attemptedAt, new Date(since))));
			const counted = await transaction
				.select({ attemptedAt: attempts.attemptedAt })
				.from(attempts)
				.where(and(eq(attempts.userId, userId), gt(attempts.attemptedAt, new Date(since))))
				.orderBy(asc(attempts.attemptedAt))
				.limit(limit);
			const oldest = counted[0];
			if (oldest && counted.length >= limit)
				return { kind: 'exhausted', oldest: oldest.attemptedAt.toISOString() as DateTime };
			await transaction.insert(attempts).values({ userId, attemptedAt: new Date(at) });
			return { kind: 'reserved' };
		});
	}
}

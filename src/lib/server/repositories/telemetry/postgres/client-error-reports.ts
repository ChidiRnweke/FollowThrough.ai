import { createHash } from 'node:crypto';
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type {
	ClientErrorFingerprint,
	ClientErrorReportRepository,
	ClientErrorReservation
} from '$lib/server/repositories/telemetry/client-error-reports';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/telemetry';

/** Postgres text cannot hold the NUL inside a fingerprint, and a stack is long; its hash is neither. */
const digest = (fingerprint: ClientErrorFingerprint): string =>
	createHash('sha256').update(fingerprint).digest('hex');

export class ClientErrorReportRecords implements ClientErrorReportRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly db: Database
	) {}

	reserve(
		fingerprint: ClientErrorFingerprint,
		at: DateTime,
		since: DateTime,
		limit: number
	): Promise<ClientErrorReservation> {
		const reports = schema.clientErrorReports;
		const userId = this.actor.userId;
		const mine = eq(reports.userId, userId);
		const inWindow = and(mine, gt(reports.reportedAt, new Date(since)));
		const hashed = digest(fingerprint);
		return this.db.transaction(async (transaction) => {
			await transaction.execute(
				sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext('client-error-budget'))`
			);
			const repeated = await transaction
				.update(reports)
				.set({ suppressed: sql`${reports.suppressed} + 1` })
				.where(and(inWindow, eq(reports.fingerprint, hashed)))
				.returning({ id: reports.id });
			if (repeated.length > 0) return { kind: 'duplicate' };
			const counted = await transaction
				.select({ reportedAt: reports.reportedAt })
				.from(reports)
				.where(inWindow)
				.orderBy(asc(reports.reportedAt))
				.limit(limit);
			const oldest = counted[0];
			if (oldest && counted.length >= limit)
				return { kind: 'exhausted', oldest: oldest.reportedAt.toISOString() as DateTime };
			const [total] = await transaction
				.select({ suppressed: sql<number>`coalesce(sum(${reports.suppressed}), 0)::int` })
				.from(reports)
				.where(mine);
			await transaction.delete(reports).where(and(mine, lte(reports.reportedAt, new Date(since))));
			await transaction.update(reports).set({ suppressed: 0 }).where(mine);
			await transaction
				.insert(reports)
				.values({ userId, fingerprint: hashed, reportedAt: new Date(at) });
			return { kind: 'reserved', suppressed: total.suppressed };
		});
	}
}

import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import type {
	ActorContext,
	AgentEvent,
	AgentRunDecisionRecord,
	AgentRunEventRecord,
	AgentRunId
} from '$lib/models';
import { ConflictError, NotFoundError } from '$lib/errors';
import type { AgentRunDecisionRepository, AgentRunEventRepository } from '$lib/server/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const toEvent = (row: typeof schema.agentRunEvents.$inferSelect): AgentRunEventRecord => ({
	cursor: row.cursor.toString(),
	runId: row.runId as AgentRunId,
	attempt: row.attempt,
	event: row.event as unknown as AgentEvent,
	createdAt: row.createdAt
});

const toDecision = (row: typeof schema.agentRunDecisions.$inferSelect): AgentRunDecisionRecord => ({
	runId: row.runId as AgentRunId,
	callId: row.callId,
	decision: row.decision,
	...(row.message ? { message: row.message } : {}),
	createdAt: row.createdAt,
	...(row.consumedAt ? { consumedAt: row.consumedAt } : {})
});

export class AgentRunEventRecords implements AgentRunEventRepository {
	constructor(private readonly database: Database) {}

	async append(
		runId: AgentRunId,
		attempt: number,
		event: AgentEvent
	): Promise<AgentRunEventRecord> {
		const [row] = await this.database
			.insert(schema.agentRunEvents)
			.values({ runId, attempt, event: event as unknown as Record<string, unknown> })
			.returning();
		return toEvent(row!);
	}

	async replay(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly AgentRunEventRecord[]> {
		const rows = await this.database
			.select({ event: schema.agentRunEvents })
			.from(schema.agentRunEvents)
			.innerJoin(schema.agentRuns, eq(schema.agentRuns.id, schema.agentRunEvents.runId))
			.where(
				and(
					eq(schema.agentRunEvents.runId, runId),
					eq(schema.agentRuns.userId, actor.userId),
					gt(schema.agentRunEvents.cursor, BigInt(after))
				)
			)
			.orderBy(asc(schema.agentRunEvents.cursor));
		return rows.map(({ event }) => toEvent(event));
	}

	async latestCursor(actor: ActorContext, runId: AgentRunId): Promise<string> {
		const [row] = await this.database
			.select({ cursor: sql<bigint>`coalesce(max(${schema.agentRunEvents.cursor}), 0)` })
			.from(schema.agentRunEvents)
			.innerJoin(schema.agentRuns, eq(schema.agentRuns.id, schema.agentRunEvents.runId))
			.where(and(eq(schema.agentRuns.id, runId), eq(schema.agentRuns.userId, actor.userId)));
		return BigInt(row?.cursor ?? 0).toString();
	}

	async reconstructText(runId: AgentRunId, attempt: number): Promise<string> {
		const rows = await this.database
			.select({ event: schema.agentRunEvents.event })
			.from(schema.agentRunEvents)
			.where(
				and(eq(schema.agentRunEvents.runId, runId), eq(schema.agentRunEvents.attempt, attempt))
			)
			.orderBy(asc(schema.agentRunEvents.cursor));
		return rows
			.map(({ event }) => event as unknown as AgentEvent)
			.filter((event): event is Extract<AgentEvent, { type: 'text_delta' }> =>
				Boolean(event.type === 'text_delta')
			)
			.map((event) => event.text)
			.join('');
	}
}

export class AgentRunDecisionRecords implements AgentRunDecisionRepository {
	constructor(private readonly database: Database) {}

	async record(
		actor: ActorContext,
		input: {
			readonly runId: AgentRunId;
			readonly callId: string;
			readonly decision: 'approve' | 'reject';
			readonly message?: string;
		}
	): Promise<AgentRunDecisionRecord> {
		const [run] = await this.database
			.select({ id: schema.agentRuns.id })
			.from(schema.agentRuns)
			.where(and(eq(schema.agentRuns.id, input.runId), eq(schema.agentRuns.userId, actor.userId)));
		if (!run) throw new NotFoundError('Agent run was not found');
		await this.database
			.insert(schema.agentRunDecisions)
			.values(input)
			.onConflictDoNothing({
				target: [schema.agentRunDecisions.runId, schema.agentRunDecisions.callId]
			});
		const [row] = await this.database
			.select()
			.from(schema.agentRunDecisions)
			.where(
				and(
					eq(schema.agentRunDecisions.runId, input.runId),
					eq(schema.agentRunDecisions.callId, input.callId)
				)
			);
		if (!row) throw new NotFoundError('Agent decision was not found');
		if (row.decision !== input.decision || (row.message ?? undefined) !== input.message)
			throw new ConflictError('A different decision was already recorded for this tool call');
		return toDecision(row);
	}

	async loadUnconsumed(runId: AgentRunId): Promise<readonly AgentRunDecisionRecord[]> {
		const rows = await this.database
			.select()
			.from(schema.agentRunDecisions)
			.where(
				and(eq(schema.agentRunDecisions.runId, runId), isNull(schema.agentRunDecisions.consumedAt))
			)
			.orderBy(asc(schema.agentRunDecisions.createdAt));
		return rows.map(toDecision);
	}

	async consume(runId: AgentRunId, callId: string, at: Date): Promise<boolean> {
		const [row] = await this.database
			.update(schema.agentRunDecisions)
			.set({ consumedAt: at })
			.where(
				and(
					eq(schema.agentRunDecisions.runId, runId),
					eq(schema.agentRunDecisions.callId, callId),
					isNull(schema.agentRunDecisions.consumedAt)
				)
			)
			.returning({ id: schema.agentRunDecisions.id });
		return Boolean(row);
	}

	async clearPending(runId: AgentRunId): Promise<boolean> {
		const [row] = await this.database
			.update(schema.agentRuns)
			.set({ pendingDecisions: [] })
			.where(eq(schema.agentRuns.id, runId))
			.returning({ id: schema.agentRuns.id });
		return Boolean(row);
	}
}

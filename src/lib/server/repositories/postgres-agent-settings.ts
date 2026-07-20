import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
	ActorContext,
	AgentPreferences,
	AgentRun,
	AgentRunId,
	AgentRunStatus,
	AgentSessionItem,
	ConversationId
} from '$lib/models';
import { assertAgentRunTransition, isTerminalAgentRunStatus, NotFoundError } from '$lib/models';
import type {
	AgentPreferencesRepository,
	AgentRunRepository,
	AgentSessionRepository
} from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const toPreferences = (row: typeof schema.agentPreferences.$inferSelect): AgentPreferences => ({
	userId: row.userId as AgentPreferences['userId'],
	...(row.defaultModel ? { defaultModel: row.defaultModel } : {}),
	executionMode: row.executionMode,
	inlineSuggestionsEnabled: row.inlineSuggestionsEnabled,
	createdAt: row.createdAt.toISOString() as AgentPreferences['createdAt'],
	updatedAt: row.updatedAt.toISOString() as AgentPreferences['updatedAt']
});

export const toRun = (row: typeof schema.agentRuns.$inferSelect): AgentRun => ({
	id: row.id as AgentRun['id'],
	userId: row.userId as AgentRun['userId'],
	conversationId: row.conversationId as AgentRun['conversationId'],
	model: row.model,
	executionMode: row.executionMode,
	status: row.status,
	requestId: row.requestId,
	...(row.cancelRequestedAt
		? { cancelRequestedAt: row.cancelRequestedAt.toISOString() as AgentRun['cancelRequestedAt'] }
		: {}),
	...(row.startedAt ? { startedAt: row.startedAt.toISOString() as AgentRun['startedAt'] } : {}),
	...(row.finishedAt ? { finishedAt: row.finishedAt.toISOString() as AgentRun['finishedAt'] } : {}),
	...(row.provenanceId ? { provenanceId: row.provenanceId as AgentRun['provenanceId'] } : {}),
	...(row.serializedState ? { serializedState: row.serializedState } : {}),
	pendingDecisions: row.pendingDecisions as unknown as AgentRun['pendingDecisions'],
	...(row.failure ? { failure: row.failure } : {}),
	...(row.providerErrorCode ? { providerErrorCode: row.providerErrorCode } : {}),
	contextSnapshot: row.contextSnapshot,
	inputSnapshot: row.inputSnapshot,
	...(row.retryOfRunId ? { retryOfRunId: row.retryOfRunId as AgentRun['retryOfRunId'] } : {}),
	definitionVersion: row.definitionVersion,
	createdAt: row.createdAt.toISOString() as AgentRun['createdAt'],
	updatedAt: row.updatedAt.toISOString() as AgentRun['updatedAt']
});

type PendingDecisionRows = NonNullable<(typeof schema.agentRuns.$inferInsert)['pendingDecisions']>;

const toPendingDecisionRows = (run: AgentRun): PendingDecisionRows =>
	run.pendingDecisions.map((decision) => ({
		callId: decision.callId,
		toolName: decision.toolName,
		arguments: decision.arguments
	})) as PendingDecisionRows;

export class PostgresAgentPreferencesRepository implements AgentPreferencesRepository {
	constructor(private readonly database: Database) {}

	async get(actor: ActorContext): Promise<AgentPreferences | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.agentPreferences)
			.where(eq(schema.agentPreferences.userId, actor.userId));
		return row ? toPreferences(row) : undefined;
	}

	async upsert(actor: ActorContext, preferences: AgentPreferences): Promise<AgentPreferences> {
		const [row] = await this.database
			.insert(schema.agentPreferences)
			.values({
				userId: actor.userId,
				defaultModel: preferences.defaultModel,
				executionMode: preferences.executionMode,
				inlineSuggestionsEnabled: preferences.inlineSuggestionsEnabled,
				createdAt: new Date(preferences.createdAt),
				updatedAt: new Date(preferences.updatedAt)
			})
			.onConflictDoUpdate({
				target: schema.agentPreferences.userId,
				set: {
					defaultModel: preferences.defaultModel,
					executionMode: preferences.executionMode,
					inlineSuggestionsEnabled: preferences.inlineSuggestionsEnabled,
					updatedAt: new Date(preferences.updatedAt)
				}
			})
			.returning();
		return toPreferences(row!);
	}
}

export class PostgresAgentRunRepository implements AgentRunRepository {
	constructor(private readonly database: Database) {}

	async findById(actor: ActorContext, id: AgentRun['id']): Promise<AgentRun | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.agentRuns)
			.where(and(eq(schema.agentRuns.id, id), eq(schema.agentRuns.userId, actor.userId)));
		return row ? toRun(row) : undefined;
	}

	async findByRequestId(actor: ActorContext, requestId: string): Promise<AgentRun | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.agentRuns)
			.where(
				and(eq(schema.agentRuns.userId, actor.userId), eq(schema.agentRuns.requestId, requestId))
			);
		return row ? toRun(row) : undefined;
	}

	async findAwaitingByConversation(
		actor: ActorContext,
		conversationId: AgentRun['conversationId']
	): Promise<AgentRun | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.agentRuns)
			.where(
				and(
					eq(schema.agentRuns.userId, actor.userId),
					eq(schema.agentRuns.conversationId, conversationId),
					eq(schema.agentRuns.status, 'awaiting_approval')
				)
			)
			.orderBy(desc(schema.agentRuns.updatedAt));
		return row ? toRun(row) : undefined;
	}

	async findLatestByConversation(
		actor: ActorContext,
		conversationId: AgentRun['conversationId']
	): Promise<AgentRun | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.agentRuns)
			.where(
				and(
					eq(schema.agentRuns.userId, actor.userId),
					eq(schema.agentRuns.conversationId, conversationId)
				)
			)
			.orderBy(desc(schema.agentRuns.updatedAt));
		return row ? toRun(row) : undefined;
	}

	async findActiveByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.agentRuns)
			.where(
				and(
					eq(schema.agentRuns.userId, actor.userId),
					eq(schema.agentRuns.conversationId, conversationId),
					inArray(schema.agentRuns.status, ['queued', 'running', 'awaiting_approval', 'cancelling'])
				)
			)
			.limit(1);
		return row ? toRun(row) : undefined;
	}

	async insert(actor: ActorContext, run: AgentRun): Promise<AgentRun> {
		const [row] = await this.database
			.insert(schema.agentRuns)
			.values(this.toInsert(actor, run))
			.returning();
		return toRun(row!);
	}

	async insertIdempotent(actor: ActorContext, run: AgentRun): Promise<AgentRun | undefined> {
		const [row] = await this.database
			.insert(schema.agentRuns)
			.values(this.toInsert(actor, run))
			.onConflictDoNothing({
				target: [schema.agentRuns.userId, schema.agentRuns.requestId]
			})
			.returning();
		return row ? toRun(row) : undefined;
	}

	async update(actor: ActorContext, run: AgentRun): Promise<AgentRun> {
		const current = await this.findById(actor, run.id);
		if (!current) throw new NotFoundError('Agent run was not found');
		if (current.status !== run.status) assertAgentRunTransition(current.status, run.status);
		const [row] = await this.database
			.update(schema.agentRuns)
			.set({
				status: run.status,
				requestId: run.requestId,
				cancelRequestedAt: run.cancelRequestedAt ? new Date(run.cancelRequestedAt) : null,
				startedAt: run.startedAt ? new Date(run.startedAt) : null,
				finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
				provenanceId: run.provenanceId ?? null,
				serializedState: run.serializedState ?? null,
				pendingDecisions: toPendingDecisionRows(run),
				failure: run.failure ?? null,
				providerErrorCode: run.providerErrorCode ?? null,
				contextSnapshot: { ...(run.contextSnapshot ?? {}) },
				inputSnapshot: { ...(run.inputSnapshot ?? {}) },
				retryOfRunId: run.retryOfRunId,
				definitionVersion: run.definitionVersion ?? 1,
				updatedAt: new Date(run.updatedAt)
			})
			.where(and(eq(schema.agentRuns.id, run.id), eq(schema.agentRuns.userId, actor.userId)))
			.returning();
		if (!row) throw new NotFoundError('Agent run was not found');
		return toRun(row);
	}

	async requestCancellation(
		actor: ActorContext,
		runId: AgentRun['id'],
		at: AgentRun['updatedAt']
	): Promise<AgentRun> {
		const run = await this.findById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		if (isTerminalAgentRunStatus(run.status) || run.status === 'cancelling') return run;
		const status = run.status === 'queued' ? 'cancelled' : 'cancelling';
		assertAgentRunTransition(run.status, status);
		const [updated] = await this.database
			.update(schema.agentRuns)
			.set({
				status,
				cancelRequestedAt: new Date(at),
				...(status === 'cancelled' ? { finishedAt: new Date(at) } : {}),
				updatedAt: new Date(at)
			})
			.where(
				and(
					eq(schema.agentRuns.id, runId),
					eq(schema.agentRuns.userId, actor.userId),
					eq(schema.agentRuns.status, run.status)
				)
			)
			.returning();
		if (updated) return toRun(updated);
		const concurrent = await this.findById(actor, runId);
		if (
			concurrent &&
			(isTerminalAgentRunStatus(concurrent.status) || concurrent.status === 'cancelling')
		)
			return concurrent;
		throw new NotFoundError('Agent run was not found');
	}

	async requeueAfterDecision(
		actor: ActorContext,
		runId: AgentRun['id'],
		at: AgentRun['updatedAt']
	): Promise<AgentRun> {
		const run = await this.findById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		if (run.status === 'queued') return run;
		assertAgentRunTransition(run.status, 'queued');
		const [updated] = await this.database
			.update(schema.agentRuns)
			.set({
				status: 'queued',
				updatedAt: new Date(at)
			})
			.where(
				and(
					eq(schema.agentRuns.id, runId),
					eq(schema.agentRuns.userId, actor.userId),
					eq(schema.agentRuns.status, run.status)
				)
			)
			.returning();
		if (updated) return toRun(updated);
		const concurrent = await this.findById(actor, runId);
		if (concurrent?.status === 'queued') return concurrent;
		throw new NotFoundError('Agent run was not found');
	}

	private toInsert(actor: ActorContext, run: AgentRun): typeof schema.agentRuns.$inferInsert {
		return {
			id: run.id,
			userId: actor.userId,
			conversationId: run.conversationId,
			model: run.model,
			executionMode: run.executionMode,
			status: run.status,
			requestId: run.requestId,
			cancelRequestedAt: run.cancelRequestedAt ? new Date(run.cancelRequestedAt) : undefined,
			startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
			finishedAt: run.finishedAt ? new Date(run.finishedAt) : undefined,
			provenanceId: run.provenanceId,
			serializedState: run.serializedState,
			pendingDecisions: toPendingDecisionRows(run),
			failure: run.failure,
			providerErrorCode: run.providerErrorCode,
			contextSnapshot: { ...(run.contextSnapshot ?? {}) },
			inputSnapshot: { ...(run.inputSnapshot ?? {}) },
			retryOfRunId: run.retryOfRunId,
			definitionVersion: run.definitionVersion ?? 1,
			createdAt: new Date(run.createdAt),
			updatedAt: new Date(run.updatedAt)
		};
	}

	async transition(
		runId: AgentRunId,
		from: AgentRunStatus | readonly AgentRunStatus[],
		to: AgentRunStatus,
		patch: Partial<AgentRun> = {}
	): Promise<AgentRun | undefined> {
		const fromStatuses = Array.isArray(from) ? from : [from];
		for (const status of fromStatuses) assertAgentRunTransition(status, to);
		const now = new Date();
		const [row] = await this.database
			.update(schema.agentRuns)
			.set({
				status: to,
				...(patch.cancelRequestedAt
					? { cancelRequestedAt: new Date(patch.cancelRequestedAt) }
					: {}),
				...(patch.startedAt ? { startedAt: new Date(patch.startedAt) } : {}),
				...(patch.finishedAt ? { finishedAt: new Date(patch.finishedAt) } : {}),
				...(patch.provenanceId !== undefined ? { provenanceId: patch.provenanceId ?? null } : {}),
				...(patch.serializedState !== undefined
					? { serializedState: patch.serializedState ?? null }
					: {}),
				...(patch.pendingDecisions !== undefined
					? {
							pendingDecisions: patch.pendingDecisions.map((d) => ({
								callId: d.callId,
								toolName: d.toolName,
								arguments: d.arguments
							})) as PendingDecisionRows
						}
					: {}),
				...(patch.failure !== undefined ? { failure: patch.failure ?? null } : {}),
				...(patch.providerErrorCode !== undefined
					? { providerErrorCode: patch.providerErrorCode ?? null }
					: {}),
				...(patch.contextSnapshot ? { contextSnapshot: { ...patch.contextSnapshot } } : {}),
				updatedAt: now
			})
			.where(
				and(
					eq(schema.agentRuns.id, runId),
					inArray(schema.agentRuns.status, fromStatuses as [AgentRunStatus, ...AgentRunStatus[]])
				)
			)
			.returning();
		return row ? toRun(row) : undefined;
	}

	async recoverInterrupted(failureMessage: string): Promise<number> {
		const rows = await this.database
			.update(schema.agentRuns)
			.set({
				status: 'failed',
				failure: failureMessage,
				finishedAt: new Date(),
				updatedAt: new Date()
			})
			.where(inArray(schema.agentRuns.status, ['running', 'cancelling']))
			.returning({ id: schema.agentRuns.id });
		return rows.length;
	}
}

const toSessionItem = (row: typeof schema.agentSessionItems.$inferSelect): AgentSessionItem => ({
	id: row.id as AgentSessionItem['id'],
	conversationId: row.conversationId as AgentSessionItem['conversationId'],
	position: row.position,
	item: row.item,
	createdAt: row.createdAt.toISOString() as AgentSessionItem['createdAt']
});

export class PostgresAgentSessionRepository implements AgentSessionRepository {
	constructor(private readonly database: Database) {}

	private async assertOwned(actor: ActorContext, conversationId: ConversationId): Promise<void> {
		const [owned] = await this.database
			.select({ id: schema.conversations.id })
			.from(schema.conversations)
			.where(
				and(
					eq(schema.conversations.id, conversationId),
					eq(schema.conversations.userId, actor.userId)
				)
			);
		if (!owned) throw new NotFoundError('Conversation was not found');
	}

	async list(
		actor: ActorContext,
		conversationId: ConversationId,
		limit?: number
	): Promise<readonly AgentSessionItem[]> {
		await this.assertOwned(actor, conversationId);
		if (limit !== undefined) {
			const rows = await this.database
				.select()
				.from(schema.agentSessionItems)
				.where(eq(schema.agentSessionItems.conversationId, conversationId))
				.orderBy(desc(schema.agentSessionItems.position))
				.limit(limit);
			return rows.reverse().map(toSessionItem);
		}
		return (
			await this.database
				.select()
				.from(schema.agentSessionItems)
				.where(eq(schema.agentSessionItems.conversationId, conversationId))
				.orderBy(asc(schema.agentSessionItems.position))
		).map(toSessionItem);
	}

	async append(
		actor: ActorContext,
		conversationId: ConversationId,
		items: readonly Readonly<Record<string, unknown>>[]
	): Promise<void> {
		if (items.length === 0) return;
		await this.assertOwned(actor, conversationId);
		const [row] = await this.database
			.select({ position: sql<number>`coalesce(max(${schema.agentSessionItems.position}), -1)` })
			.from(schema.agentSessionItems)
			.where(eq(schema.agentSessionItems.conversationId, conversationId));
		const start = Number(row?.position ?? -1) + 1;
		await this.database.insert(schema.agentSessionItems).values(
			items.map((item, index) => ({
				id: crypto.randomUUID(),
				conversationId,
				position: start + index,
				item: { ...item }
			}))
		);
	}

	async pop(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentSessionItem | undefined> {
		const [latest] = await this.list(actor, conversationId, 1);
		if (!latest) return undefined;
		await this.database
			.delete(schema.agentSessionItems)
			.where(eq(schema.agentSessionItems.id, latest.id));
		return latest;
	}

	async clear(actor: ActorContext, conversationId: ConversationId): Promise<void> {
		await this.assertOwned(actor, conversationId);
		const rows = await this.database
			.select({ id: schema.agentSessionItems.id })
			.from(schema.agentSessionItems)
			.where(eq(schema.agentSessionItems.conversationId, conversationId));
		if (rows.length > 0)
			await this.database.delete(schema.agentSessionItems).where(
				inArray(
					schema.agentSessionItems.id,
					rows.map((row) => row.id)
				)
			);
	}

	async replace(
		conversationId: import('$lib/models').ConversationId,
		items: readonly Readonly<Record<string, unknown>>[]
	): Promise<void> {
		await this.database.transaction(async (transaction) => {
			await transaction
				.delete(schema.agentSessionItems)
				.where(eq(schema.agentSessionItems.conversationId, conversationId));
			if (items.length > 0)
				await transaction.insert(schema.agentSessionItems).values(
					items.map((item, position) => ({
						id: crypto.randomUUID(),
						conversationId,
						position,
						item: { ...item }
					}))
				);
		});
	}
}

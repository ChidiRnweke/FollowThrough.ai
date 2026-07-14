import { and, desc, eq } from 'drizzle-orm';
import type { ActorContext, AgentPreferences, AgentRun } from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { AgentPreferencesRepository, AgentRunRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const toPreferences = (row: typeof schema.agentPreferences.$inferSelect): AgentPreferences => ({
	userId: row.userId as AgentPreferences['userId'],
	...(row.defaultModel ? { defaultModel: row.defaultModel } : {}),
	executionMode: row.executionMode,
	createdAt: row.createdAt.toISOString() as AgentPreferences['createdAt'],
	updatedAt: row.updatedAt.toISOString() as AgentPreferences['updatedAt']
});

const toRun = (row: typeof schema.agentRuns.$inferSelect): AgentRun => ({
	id: row.id as AgentRun['id'],
	userId: row.userId as AgentRun['userId'],
	conversationId: row.conversationId as AgentRun['conversationId'],
	model: row.model,
	executionMode: row.executionMode,
	status: row.status,
	...(row.serializedState ? { serializedState: row.serializedState } : {}),
	pendingDecisions: row.pendingDecisions as unknown as AgentRun['pendingDecisions'],
	...(row.failure ? { failure: row.failure } : {}),
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
				createdAt: new Date(preferences.createdAt),
				updatedAt: new Date(preferences.updatedAt)
			})
			.onConflictDoUpdate({
				target: schema.agentPreferences.userId,
				set: {
					defaultModel: preferences.defaultModel,
					executionMode: preferences.executionMode,
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

	async insert(actor: ActorContext, run: AgentRun): Promise<AgentRun> {
		const [row] = await this.database
			.insert(schema.agentRuns)
			.values({
				id: run.id,
				userId: actor.userId,
				conversationId: run.conversationId,
				model: run.model,
				executionMode: run.executionMode,
				status: run.status,
				serializedState: run.serializedState,
				pendingDecisions: toPendingDecisionRows(run),
				failure: run.failure,
				createdAt: new Date(run.createdAt),
				updatedAt: new Date(run.updatedAt)
			})
			.returning();
		return toRun(row!);
	}

	async update(actor: ActorContext, run: AgentRun): Promise<AgentRun> {
		const [row] = await this.database
			.update(schema.agentRuns)
			.set({
				status: run.status,
				serializedState: run.serializedState,
				pendingDecisions: toPendingDecisionRows(run),
				failure: run.failure,
				updatedAt: new Date(run.updatedAt)
			})
			.where(and(eq(schema.agentRuns.id, run.id), eq(schema.agentRuns.userId, actor.userId)))
			.returning();
		if (!row) throw new NotFoundError('Agent run was not found');
		return toRun(row);
	}
}

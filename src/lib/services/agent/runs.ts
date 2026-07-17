import type {
	ActorContext,
	AgentExecutionMode,
	AgentRun,
	AgentRunId,
	ConversationId,
	DateTime,
	PendingAgentDecision
} from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { AgentRunRepository } from '$lib/repositories';

const now = (): DateTime => new Date().toISOString() as DateTime;

export interface AgentRunStore {
	create(
		actor: ActorContext,
		input: {
			conversationId: ConversationId;
			model: string;
			executionMode: AgentExecutionMode;
			contextSnapshot: Readonly<Record<string, unknown>>;
			inputSnapshot?: Readonly<Record<string, unknown>>;
			retryOfRunId?: AgentRunId;
		}
	): Promise<AgentRun>;
	get(actor: ActorContext, runId: AgentRunId): Promise<AgentRun>;
	getLatestForConversation(actor: ActorContext, conversationId: ConversationId): Promise<AgentRun>;
	updateContext(
		actor: ActorContext,
		runId: AgentRunId,
		contextSnapshot: Readonly<Record<string, unknown>>
	): Promise<AgentRun>;
	pause(
		actor: ActorContext,
		runId: AgentRunId,
		serializedState: string,
		pendingDecisions: readonly PendingAgentDecision[]
	): Promise<AgentRun>;
	complete(actor: ActorContext, runId: AgentRunId): Promise<AgentRun>;
	fail(
		actor: ActorContext,
		runId: AgentRunId,
		failure: string,
		providerErrorCode?: string
	): Promise<AgentRun>;
	cancel(actor: ActorContext, runId: AgentRunId): Promise<AgentRun>;
}

export class PersistentAgentRunStore implements AgentRunStore {
	constructor(private readonly repository: AgentRunRepository) {}

	create(
		actor: ActorContext,
		input: {
			conversationId: ConversationId;
			model: string;
			executionMode: AgentExecutionMode;
			contextSnapshot: Readonly<Record<string, unknown>>;
			inputSnapshot?: Readonly<Record<string, unknown>>;
			retryOfRunId?: AgentRunId;
		}
	): Promise<AgentRun> {
		const timestamp = now();
		return this.repository.insert(actor, {
			id: crypto.randomUUID() as AgentRunId,
			userId: actor.userId,
			...input,
			status: 'running',
			requestId: crypto.randomUUID(),
			pendingDecisions: [],
			definitionVersion: 1,
			createdAt: timestamp,
			updatedAt: timestamp
		});
	}

	async get(actor: ActorContext, runId: AgentRunId): Promise<AgentRun> {
		const run = await this.repository.findById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return run;
	}

	async getLatestForConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun> {
		const run = await this.repository.findLatestByConversation(actor, conversationId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return run;
	}

	async updateContext(
		actor: ActorContext,
		runId: AgentRunId,
		contextSnapshot: Readonly<Record<string, unknown>>
	): Promise<AgentRun> {
		const run = await this.get(actor, runId);
		return this.repository.update(actor, { ...run, contextSnapshot, updatedAt: now() });
	}

	async pause(
		actor: ActorContext,
		runId: AgentRunId,
		serializedState: string,
		pendingDecisions: readonly PendingAgentDecision[]
	): Promise<AgentRun> {
		const run = await this.get(actor, runId);
		return this.repository.update(actor, {
			...run,
			status: 'awaiting_approval',
			serializedState,
			pendingDecisions,
			updatedAt: now()
		});
	}

	async complete(actor: ActorContext, runId: AgentRunId): Promise<AgentRun> {
		const run = await this.get(actor, runId);
		return this.repository.update(actor, {
			...run,
			status: 'completed',
			serializedState: undefined,
			pendingDecisions: [],
			updatedAt: now()
		});
	}

	async fail(
		actor: ActorContext,
		runId: AgentRunId,
		failure: string,
		providerErrorCode?: string
	): Promise<AgentRun> {
		const run = await this.get(actor, runId);
		return this.repository.update(actor, {
			...run,
			status: 'failed',
			failure,
			providerErrorCode,
			pendingDecisions: [],
			updatedAt: now()
		});
	}

	async cancel(actor: ActorContext, runId: AgentRunId): Promise<AgentRun> {
		const run = await this.get(actor, runId);
		return this.repository.update(actor, {
			...run,
			status: 'cancelled',
			failure: 'The request was cancelled',
			pendingDecisions: [],
			updatedAt: now()
		});
	}
}

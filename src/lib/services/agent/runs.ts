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
		}
	): Promise<AgentRun>;
	get(actor: ActorContext, runId: AgentRunId): Promise<AgentRun>;
	pause(
		actor: ActorContext,
		runId: AgentRunId,
		serializedState: string,
		pendingDecisions: readonly PendingAgentDecision[]
	): Promise<AgentRun>;
	complete(actor: ActorContext, runId: AgentRunId): Promise<AgentRun>;
	fail(actor: ActorContext, runId: AgentRunId, failure: string): Promise<AgentRun>;
}

export class PersistentAgentRunStore implements AgentRunStore {
	constructor(private readonly repository: AgentRunRepository) {}

	create(
		actor: ActorContext,
		input: {
			conversationId: ConversationId;
			model: string;
			executionMode: AgentExecutionMode;
		}
	): Promise<AgentRun> {
		const timestamp = now();
		return this.repository.insert(actor, {
			id: crypto.randomUUID() as AgentRunId,
			userId: actor.userId,
			...input,
			status: 'running',
			pendingDecisions: [],
			createdAt: timestamp,
			updatedAt: timestamp
		});
	}

	async get(actor: ActorContext, runId: AgentRunId): Promise<AgentRun> {
		const run = await this.repository.findById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return run;
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

	async fail(actor: ActorContext, runId: AgentRunId, failure: string): Promise<AgentRun> {
		const run = await this.get(actor, runId);
		return this.repository.update(actor, {
			...run,
			status: 'failed',
			failure,
			pendingDecisions: [],
			updatedAt: now()
		});
	}
}

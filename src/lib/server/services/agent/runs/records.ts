import type { ActorContext } from '$lib/models/identity';
import type {
	AgentEvent,
	AgentRun,
	AgentRunDecisionRecord,
	AgentRunEventRecord,
	AgentRunId,
	AgentSessionItem,
	ConversationId,
	PersistedSessionItem,
	ResolvedAgentRun,
	StoredAgentRunEventRecord
} from '$lib/models/agent';
import type {
	AgentRunDecisionRepository,
	AgentRunEventRepository,
	AgentRunRepository,
	AgentSessionRepository
} from '$lib/server/repositories/agent';

/** The run records the harness reads and creates. */
export interface AgentRuns {
	findById(actor: ActorContext, id: AgentRunId): Promise<AgentRun | undefined>;
	findAgentById(actor: ActorContext, id: AgentRunId): Promise<ResolvedAgentRun | undefined>;
	/** A repeated request id finds the run it already created, so submission is idempotent. */
	findByRequestId(actor: ActorContext, requestId: string): Promise<AgentRun | undefined>;
	findActiveByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined>;
	/** Inserts the run unless its request id exists; answers undefined when it already does. */
	insertIdempotent(actor: ActorContext, run: AgentRun): Promise<AgentRun | undefined>;
	listInterrupted(): Promise<readonly AgentRun[]>;
	listQueuedAgents(): Promise<readonly ResolvedAgentRun[]>;
}
export class AgentRunService implements AgentRuns {
	constructor(private readonly repository: AgentRunRepository) {}
	findById(actor: ActorContext, id: AgentRunId) {
		return this.repository.findById(actor, id);
	}
	findAgentById(actor: ActorContext, id: AgentRunId) {
		return this.repository.findAgentById(actor, id);
	}
	findByRequestId(actor: ActorContext, requestId: string) {
		return this.repository.findByRequestId(actor, requestId);
	}
	findActiveByConversation(actor: ActorContext, conversationId: ConversationId) {
		return this.repository.findActiveByConversation(actor, conversationId);
	}
	insertIdempotent(actor: ActorContext, run: AgentRun) {
		return this.repository.insertIdempotent(actor, run);
	}
	listInterrupted() {
		return this.repository.listInterrupted();
	}
	listQueuedAgents() {
		return this.repository.listQueuedAgents();
	}
}

/** A run's append-only event log, which a client reads by cursor. */
export interface AgentRunEvents {
	append(runId: AgentRunId, attempt: number, event: AgentEvent): Promise<AgentRunEventRecord>;
	replay(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly StoredAgentRunEventRecord[]>;
	latestCursor(actor: ActorContext, runId: AgentRunId): Promise<string>;
	listAttempt(runId: AgentRunId, attempt: number): Promise<readonly StoredAgentRunEventRecord[]>;
}
export class AgentRunEventService implements AgentRunEvents {
	constructor(private readonly repository: AgentRunEventRepository) {}
	append(runId: AgentRunId, attempt: number, event: AgentEvent) {
		return this.repository.append(runId, attempt, event);
	}
	replay(actor: ActorContext, runId: AgentRunId, after: string) {
		return this.repository.replay(actor, runId, after);
	}
	latestCursor(actor: ActorContext, runId: AgentRunId) {
		return this.repository.latestCursor(actor, runId);
	}
	listAttempt(runId: AgentRunId, attempt: number) {
		return this.repository.listAttempt(runId, attempt);
	}
}

/** The user's decisions on parked tool calls, recorded before the run resumes. */
export interface AgentRunDecisions {
	record(
		actor: ActorContext,
		input: {
			readonly runId: AgentRunId;
			readonly callId: string;
			readonly decision: 'approve' | 'reject';
			readonly message?: string;
		}
	): Promise<AgentRunDecisionRecord>;
	loadUnconsumed(runId: AgentRunId): Promise<readonly AgentRunDecisionRecord[]>;
	consume(runId: AgentRunId, callId: string, at: Date): Promise<boolean>;
	clearPending(runId: AgentRunId): Promise<void>;
}
export class AgentRunDecisionService implements AgentRunDecisions {
	constructor(private readonly repository: AgentRunDecisionRepository) {}
	record(actor: ActorContext, input: Parameters<AgentRunDecisions['record']>[1]) {
		return this.repository.record(actor, input);
	}
	loadUnconsumed(runId: AgentRunId) {
		return this.repository.loadUnconsumed(runId);
	}
	consume(runId: AgentRunId, callId: string, at: Date) {
		return this.repository.consume(runId, callId, at);
	}
	clearPending(runId: AgentRunId) {
		return this.repository.clearPending(runId);
	}
}

/** The provider session items a conversation replays. */
export interface AgentSessions {
	list(
		actor: ActorContext,
		conversationId: ConversationId,
		limit?: number
	): Promise<readonly AgentSessionItem[]>;
	replace(conversationId: ConversationId, items: readonly PersistedSessionItem[]): Promise<void>;
}
export class AgentSessionService implements AgentSessions {
	constructor(private readonly repository: AgentSessionRepository) {}
	list(actor: ActorContext, conversationId: ConversationId, limit?: number) {
		return this.repository.list(actor, conversationId, limit);
	}
	replace(conversationId: ConversationId, items: readonly PersistedSessionItem[]) {
		return this.repository.replace(conversationId, items);
	}
}

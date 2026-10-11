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
	findById(id: AgentRunId): Promise<AgentRun | undefined>;
	findAgentById(id: AgentRunId): Promise<ResolvedAgentRun | undefined>;
	/** A repeated request id finds the run it already created, so submission is idempotent. */
	findByRequestId(requestId: string): Promise<AgentRun | undefined>;
	findActiveByConversation(conversationId: ConversationId): Promise<AgentRun | undefined>;
	/** Inserts the run unless its request id exists; answers undefined when it already does. */
	insertIdempotent(run: AgentRun): Promise<AgentRun | undefined>;
}
export class AgentRunService implements AgentRuns {
	constructor(private readonly repository: AgentRunRepository) {}
	findById(id: AgentRunId) {
		return this.repository.findById(id);
	}
	findAgentById(id: AgentRunId) {
		return this.repository.findAgentById(id);
	}
	findByRequestId(requestId: string) {
		return this.repository.findByRequestId(requestId);
	}
	findActiveByConversation(conversationId: ConversationId) {
		return this.repository.findActiveByConversation(conversationId);
	}
	insertIdempotent(run: AgentRun) {
		return this.repository.insertIdempotent(run);
	}
}

/** A run's append-only event log, which a client reads by cursor. */
export interface AgentRunEvents {
	append(runId: AgentRunId, attempt: number, event: AgentEvent): Promise<AgentRunEventRecord>;
	replay(runId: AgentRunId, after: string): Promise<readonly StoredAgentRunEventRecord[]>;
	latestCursor(runId: AgentRunId): Promise<string>;
	listAttempt(runId: AgentRunId, attempt: number): Promise<readonly StoredAgentRunEventRecord[]>;
}
export class AgentRunEventService implements AgentRunEvents {
	constructor(
		private readonly actor: ActorContext,
		private readonly repository: AgentRunEventRepository
	) {}
	append(runId: AgentRunId, attempt: number, event: AgentEvent) {
		return this.repository.append(runId, attempt, event);
	}
	replay(runId: AgentRunId, after: string) {
		return this.repository.replay(runId, after);
	}
	latestCursor(runId: AgentRunId) {
		return this.repository.latestCursor(runId);
	}
	listAttempt(runId: AgentRunId, attempt: number) {
		return this.repository.listAttempt(runId, attempt);
	}
}

/** The user's decisions on parked tool calls, recorded before the run resumes. */
export interface AgentRunDecisions {
	record(input: {
		readonly runId: AgentRunId;
		readonly callId: string;
		readonly decision: 'approve' | 'reject';
		readonly message?: string;
	}): Promise<AgentRunDecisionRecord>;
	loadUnconsumed(runId: AgentRunId): Promise<readonly AgentRunDecisionRecord[]>;
	consume(runId: AgentRunId, callId: string, at: Date): Promise<boolean>;
	clearPending(runId: AgentRunId): Promise<void>;
}
export class AgentRunDecisionService implements AgentRunDecisions {
	constructor(
		private readonly actor: ActorContext,
		private readonly repository: AgentRunDecisionRepository
	) {}
	record(input: Parameters<AgentRunDecisions['record']>[0]) {
		return this.repository.record(input);
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
	list(conversationId: ConversationId, limit?: number): Promise<readonly AgentSessionItem[]>;
	replace(conversationId: ConversationId, items: readonly PersistedSessionItem[]): Promise<void>;
}
export class AgentSessionService implements AgentSessions {
	constructor(
		private readonly actor: ActorContext,
		private readonly repository: AgentSessionRepository
	) {}
	list(conversationId: ConversationId, limit?: number) {
		return this.repository.list(conversationId, limit);
	}
	replace(conversationId: ConversationId, items: readonly PersistedSessionItem[]) {
		return this.repository.replace(conversationId, items);
	}
}

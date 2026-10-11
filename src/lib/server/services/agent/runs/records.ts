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

/** A run's append-only event log, which a client reads by cursor. */
export interface AgentRunEvents {
	append(runId: AgentRunId, attempt: number, event: AgentEvent): Promise<AgentRunEventRecord>;
	replay(runId: AgentRunId, after: string): Promise<readonly StoredAgentRunEventRecord[]>;
	latestCursor(runId: AgentRunId): Promise<string>;
	listAttempt(runId: AgentRunId, attempt: number): Promise<readonly StoredAgentRunEventRecord[]>;
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

/** The provider session items a conversation replays. */
export interface AgentSessions {
	list(conversationId: ConversationId, limit?: number): Promise<readonly AgentSessionItem[]>;
	replace(conversationId: ConversationId, items: readonly PersistedSessionItem[]): Promise<void>;
}

/** Everything the agent harness reads and writes about a run, its events, decisions and sessions. */
export interface AgentHarnessRecords
	extends AgentRuns, AgentRunEvents, AgentRunDecisions, AgentSessions {}

export class AgentRunHarnessRecords implements AgentHarnessRecords {
	constructor(
		private readonly runs: AgentRunRepository,
		private readonly events: AgentRunEventRepository,
		private readonly decisions: AgentRunDecisionRepository,
		private readonly sessions: AgentSessionRepository
	) {}

	findById(id: AgentRunId) {
		return this.runs.findById(id);
	}
	findAgentById(id: AgentRunId) {
		return this.runs.findAgentById(id);
	}
	findByRequestId(requestId: string) {
		return this.runs.findByRequestId(requestId);
	}
	findActiveByConversation(conversationId: ConversationId) {
		return this.runs.findActiveByConversation(conversationId);
	}
	insertIdempotent(run: AgentRun) {
		return this.runs.insertIdempotent(run);
	}

	append(runId: AgentRunId, attempt: number, event: AgentEvent) {
		return this.events.append(runId, attempt, event);
	}
	replay(runId: AgentRunId, after: string) {
		return this.events.replay(runId, after);
	}
	latestCursor(runId: AgentRunId) {
		return this.events.latestCursor(runId);
	}
	listAttempt(runId: AgentRunId, attempt: number) {
		return this.events.listAttempt(runId, attempt);
	}

	record(input: Parameters<AgentRunDecisions['record']>[0]) {
		return this.decisions.record(input);
	}
	loadUnconsumed(runId: AgentRunId) {
		return this.decisions.loadUnconsumed(runId);
	}
	consume(runId: AgentRunId, callId: string, at: Date) {
		return this.decisions.consume(runId, callId, at);
	}
	clearPending(runId: AgentRunId) {
		return this.decisions.clearPending(runId);
	}

	list(conversationId: ConversationId, limit?: number) {
		return this.sessions.list(conversationId, limit);
	}
	replace(conversationId: ConversationId, items: readonly PersistedSessionItem[]) {
		return this.sessions.replace(conversationId, items);
	}
}

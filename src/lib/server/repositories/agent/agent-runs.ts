import type { ActorContext } from '$lib/models/identity';
import type {
	AgentEvent,
	AgentRun,
	AgentRunDecisionRecord,
	AgentRunEventRecord,
	AgentRunId,
	AgentRunStatus,
	ConversationId
} from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';

/** `insertIdempotent` is what makes `submit` safe to retry: a repeated `requestId` returns the existing run instead of double-firing the agent. `transition` enforces the run state machine at the storage boundary. */
export interface AgentRunRepository {
	findById(actor: ActorContext, id: AgentRunId): Promise<AgentRun | undefined>;
	findByRequestId(actor: ActorContext, requestId: string): Promise<AgentRun | undefined>;
	findAwaitingByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined>;
	findLatestByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined>;
	findActiveByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined>;
	insert(actor: ActorContext, run: AgentRun): Promise<AgentRun>;
	insertIdempotent(actor: ActorContext, run: AgentRun): Promise<AgentRun | undefined>;
	update(actor: ActorContext, run: AgentRun): Promise<AgentRun>;
	transition(
		runId: AgentRunId,
		from: AgentRunStatus | readonly AgentRunStatus[],
		to: AgentRunStatus,
		patch?: Partial<AgentRun>
	): Promise<AgentRun | undefined>;
	requestCancellation(actor: ActorContext, runId: AgentRunId, at: DateTime): Promise<AgentRun>;
	requeueAfterDecision(actor: ActorContext, runId: AgentRunId, at: DateTime): Promise<AgentRun>;
	recoverInterrupted(failureMessage: string): Promise<number>;
}

/** The append-only event log a client streams by cursor; `replay` is what lets a reconnecting client catch up from `after` instead of re-fetching everything. */
export interface AgentRunEventRepository {
	append(runId: AgentRunId, attempt: number, event: AgentEvent): Promise<AgentRunEventRecord>;
	replay(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly AgentRunEventRecord[]>;
	latestCursor(actor: ActorContext, runId: AgentRunId): Promise<string>;
	reconstructText(runId: AgentRunId, attempt: number): Promise<string>;
}

/** Approvals and rejections for parked tool calls, recorded before the run requeues so a decision is never lost between the click and the resume. */
export interface AgentRunDecisionRepository {
	record(
		actor: ActorContext,
		input: {
			readonly runId: AgentRunId;
			readonly callId: string;
			readonly decision: 'approve' | 'reject';
			readonly message?: string;
		}
	): Promise<AgentRunDecisionRecord>;
	/**
	 * Every decision still waiting to be applied, oldest first. A turn can park on several
	 * tool calls at once, and the user may answer all of them before the run resumes.
	 */
	loadUnconsumed(runId: AgentRunId): Promise<readonly AgentRunDecisionRecord[]>;
	consume(runId: AgentRunId, callId: string, at: Date): Promise<boolean>;
	clearPending(runId: AgentRunId): Promise<boolean>;
}

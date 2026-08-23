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
import type { ResolvedAgentRun } from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';

/** `insertIdempotent` is what makes `submit` safe to retry: a repeated `requestId` returns the existing run instead of double-firing the agent. `transition` enforces the run state machine at the storage boundary. */
export interface AgentRunRepository {
	findById(actor: ActorContext, id: AgentRunId): Promise<AgentRun | undefined>;
	findAgentById(actor: ActorContext, id: AgentRunId): Promise<ResolvedAgentRun | undefined>;
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
	transitionAgent(
		runId: AgentRunId,
		from: AgentRunStatus | readonly AgentRunStatus[],
		to: AgentRunStatus,
		patch?: Partial<ResolvedAgentRun>
	): Promise<ResolvedAgentRun | undefined>;
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
	reconstructOutput(runId: AgentRunId, attempt: number): Promise<readonly OutputSegment[]>;
}

/**
 * A contiguous run of one kind of output, with the cursor it began at.
 *
 * A turn is not "some tools, then a paragraph": the agent thinks, acts, speaks, acts again.
 * Reconstructing it as one string threw that order away, so a reopened conversation showed
 * every tool call before everything the agent said, and its reasoning not at all. Segments
 * keep the shape of what happened, and the cursor is what lets the persisted messages be put
 * back in the order the events arrived.
 */
export interface OutputSegment {
	readonly kind: 'text' | 'reasoning';
	readonly text: string;
	readonly cursor: string;
}

/**
 * Fold an ordered event log into those segments. Shared by every implementation of the
 * repository so a fake and Postgres cannot disagree about what a turn looked like.
 */
export const segmentOutput = (
	records: readonly { readonly cursor: string; readonly event: AgentEvent }[]
): readonly OutputSegment[] => {
	const segments: { kind: 'text' | 'reasoning'; text: string; cursor: string }[] = [];
	// `open` is what makes this faithful rather than merely grouped: anything else in the
	// stream — a tool call above all — closes the current run. Merged across a call, a
	// sentence spoken after the work would carry the cursor from before it and be replayed
	// ahead of the work it describes.
	let open: (typeof segments)[number] | undefined;
	for (const { cursor, event } of records) {
		if (event.type !== 'text_delta' && event.type !== 'reasoning_delta') {
			open = undefined;
			continue;
		}
		const kind = event.type === 'text_delta' ? 'text' : 'reasoning';
		if (open?.kind === kind) open.text += event.text;
		else {
			open = { kind, text: event.text, cursor };
			segments.push(open);
		}
	}
	return segments.filter((segment) => segment.text.length > 0);
};

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

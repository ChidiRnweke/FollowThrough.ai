import type { ActorContext } from '$lib/models/identity';
import type {
	AgentEvent,
	AgentRun,
	AgentRunDecisionRecord,
	AgentRunEventRecord,
	AgentRunId,
	RunSettlementWrite,
	RunCancellationWrite,
	RunApprovalWrite,
	WorkflowContextWrite,
	WorkflowSettlementWrite,
	AgentProvenanceWrite,
	AgentContextWrite,
	RunClaimWrite,
	AgentCheckpointWrite,
	PreparedAgentRun,
	ConversationId,
	StoredAgentRunEventRecord
} from '$lib/models/agent';
import type { ResolvedAgentRun } from '$lib/models/agent';
import type { WorkflowAgentRun } from '$lib/models/agent';
import type { ExtractPromisesOutput } from '$lib/models/todos';
import type {
	GenerateMermaidDiagramOutput,
	ReviseInlineMermaidOutput,
	ConvertInlineMermaidOutput
} from '$lib/models/diagrams';
import type {
	TodoSuggestion,
	ReferenceSuggestion,
	BacklinkSuggestion,
	DiagramSuggestion
} from '$lib/models/suggestions';
import type { RelateSelectionOutput } from '$lib/models/relationships';
import type { FindReferencesOutput } from '$lib/models/references';

/** `insertIdempotent` is what makes `submit` safe to retry: a repeated `requestId` returns the existing run instead of double-firing the agent. Conditional writes persist resolved values only while the expected run state still holds. */
export interface AgentRunRepository {
	findById(actor: ActorContext, id: AgentRunId): Promise<AgentRun | undefined>;
	/** Lock an actor-owned run within the caller transaction. */
	findForWrite(actor: ActorContext, id: AgentRunId): Promise<AgentRun | undefined>;
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
	settle(runId: AgentRunId, change: RunSettlementWrite): Promise<AgentRun | undefined>;
	claimAgent(runId: AgentRunId, change: RunClaimWrite): Promise<ResolvedAgentRun | undefined>;
	claimWorkflow(runId: AgentRunId, change: RunClaimWrite): Promise<WorkflowAgentRun | undefined>;
	checkpointAgent(
		runId: AgentRunId,
		change: AgentCheckpointWrite
	): Promise<ResolvedAgentRun | undefined>;
	updateCancellation(
		actor: ActorContext,
		runId: AgentRunId,
		change: RunCancellationWrite
	): Promise<AgentRun>;
	updateAgentProvenance(
		actor: ActorContext,
		runId: AgentRunId,
		change: AgentProvenanceWrite
	): Promise<ResolvedAgentRun>;
	updateAgentContext(
		actor: ActorContext,
		runId: AgentRunId,
		change: AgentContextWrite
	): Promise<PreparedAgentRun>;
	updateWorkflowSettlement(
		actor: ActorContext,
		runId: AgentRunId,
		change: WorkflowSettlementWrite
	): Promise<WorkflowAgentRun>;
	updateWorkflowContext(
		actor: ActorContext,
		runId: AgentRunId,
		change: WorkflowContextWrite
	): Promise<WorkflowAgentRun>;
	updateApproval(
		actor: ActorContext,
		runId: AgentRunId,
		change: RunApprovalWrite
	): Promise<AgentRun>;
	listInterrupted(): Promise<readonly AgentRun[]>;
	listQueuedAgents(): Promise<readonly ResolvedAgentRun[]>;
	listQueuedWorkflows(): Promise<readonly WorkflowAgentRun[]>;
}

/** The append-only event log a client streams by cursor; `replay` is what lets a reconnecting client catch up from `after` instead of re-fetching everything. */
export type NoteActionResult =
	| { readonly action: 'diagram'; readonly result: GenerateMermaidDiagramOutput<DiagramSuggestion> }
	| { readonly action: 'revise'; readonly result: ReviseInlineMermaidOutput }
	| { readonly action: 'convert'; readonly result: ConvertInlineMermaidOutput<DiagramSuggestion> }
	| { readonly action: 'relate'; readonly result: RelateSelectionOutput<BacklinkSuggestion> }
	| { readonly action: 'promises'; readonly result: ExtractPromisesOutput<TodoSuggestion> }
	| { readonly action: 'reference'; readonly result: FindReferencesOutput<ReferenceSuggestion> };

export interface AgentRunEventRepository {
	appendNoteActionResult(runId: AgentRunId, result: NoteActionResult): Promise<AgentRunEventRecord>;
	append(runId: AgentRunId, attempt: number, event: AgentEvent): Promise<AgentRunEventRecord>;
	replay(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly StoredAgentRunEventRecord[]>;
	latestCursor(actor: ActorContext, runId: AgentRunId): Promise<string>;
	/** Read one attempt in cursor order, retaining unreadable rows and their identities. */
	listAttempt(runId: AgentRunId, attempt: number): Promise<readonly StoredAgentRunEventRecord[]>;
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
	clearPending(runId: AgentRunId): Promise<void>;
}

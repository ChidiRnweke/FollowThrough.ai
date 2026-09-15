import type { ActorContext } from '$lib/models/identity';
import type { AgentRun, AgentRunId, AgentRunReceipt, NoteActionKind } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
export type {
	AgentRunRepository,
	AgentRunEventRepository,
	AgentRunDecisionRepository,
	AgentSessionRepository
} from '$lib/server/repositories/agent';
export type AgentRunExecutionOutcome = 'completed' | 'awaiting_approval' | 'cancelled';
export interface AgentRunExecutor {
	execute(runId: AgentRunId, signal: AbortSignal): Promise<AgentRunExecutionOutcome>;
	finishCancellation(runId: AgentRunId): Promise<AgentRun | undefined>;
	failRun(runId: AgentRunId, error: Error): Promise<void>;
}
/**
 * `Result` stays unconstrained, and the reading happens in {@link
 * WorkflowRunner.execute} instead.
 *
 * Constraining it to `AgentPayload` is what this looks like it wants, because
 * the result is appended to the event log and replayed to a client that
 * reconnects. But the tasks return domain outputs — `FindReferencesOutput`,
 * `GenerateMermaidDiagramOutput` — which are JSON-shaped and still not
 * assignable to an index signature. Satisfying the constraint would mean
 * putting one on each of those domain types, which is the open-keyed indexing
 * this effort removes, in the layer furthest from the wire.
 */
export interface WorkflowRunTask<Result> {
	readonly action: NoteActionKind;
	readonly noteId: NoteId;
	/** Names the run in the conversation list, e.g. "Convert Mermaid to draw.io". */
	readonly title: string;
	readonly model?: string;
	run(signal: AbortSignal): Promise<Result>;
}

/**
 * The seam controllers depend on: starting a note action without knowing how runs
 * are stored or streamed, so a controller test can drive one without a database.
 */
export interface WorkflowRunStarter {
	start<Result>(actor: ActorContext, task: WorkflowRunTask<Result>): Promise<AgentRunReceipt>;
}

export interface RunSettlement {
	settle(
		runId: AgentRunId,
		outcome: import('$lib/models/agent').RunSettlementOutcome,
		materialize: (run: AgentRun) => Promise<void>
	): Promise<import('$lib/models/agent').RunSettlementResult>;
}

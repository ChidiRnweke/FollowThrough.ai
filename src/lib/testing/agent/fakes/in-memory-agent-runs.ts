import type { ActorContext } from '$lib/models/identity';
import type { WorkflowAgentRun } from '$lib/models/agent';
import type { NoteActionResult } from '$lib/server/repositories/agent/agent-runs';
import { noteActionEvent } from '$lib/server/repositories/agent/stored-values';
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
	ResolvedAgentRun,
	StoredAgentRunEventRecord
} from '$lib/models/agent';
import type { OutputSegment } from '$lib/server/repositories/agent';
import { segmentOutput } from '$lib/server/repositories/agent';
import { ConflictError, NotFoundError, ValidationError } from '$lib/errors';
import type {
	AgentRunDecisionRepository,
	AgentRunEventRepository,
	AgentRunRepository
} from '$lib/server/repositories/agent';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export class InMemoryAgentRunPersistence
	implements
		AgentRunRepository,
		AgentRunEventRepository,
		AgentRunDecisionRepository,
		SnapshotParticipant
{
	runs: AgentRun[] = [];
	/** Allows a cancellation to commit while the execution claim is waiting on storage. */
	executionClaim: Promise<void> = Promise.resolve();
	events: AgentRunEventRecord[] = [];
	decisions: AgentRunDecisionRecord[] = [];
	private cursor = 0n;

	async findById(actor: ActorContext, id: AgentRunId): Promise<AgentRun | undefined> {
		return this.runs.find((run) => run.id === id && run.userId === actor.userId);
	}

	async findForWrite(actor: ActorContext, id: AgentRunId): Promise<AgentRun | undefined> {
		return this.findById(actor, id);
	}

	async findAgentById(actor: ActorContext, id: AgentRunId): Promise<ResolvedAgentRun | undefined> {
		return this.runs.find(
			(run): run is ResolvedAgentRun =>
				run.kind === 'agent' && run.id === id && run.userId === actor.userId
		);
	}

	async findByRequestId(actor: ActorContext, requestId: string): Promise<AgentRun | undefined> {
		return this.runs.find((run) => run.userId === actor.userId && run.requestId === requestId);
	}

	async findAwaitingByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined> {
		return this.runs.find(
			(run) =>
				run.userId === actor.userId &&
				run.conversationId === conversationId &&
				run.status === 'awaiting_approval'
		);
	}

	async findLatestByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined> {
		return this.runs
			.filter((run) => run.userId === actor.userId && run.conversationId === conversationId)
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
	}

	async findActiveByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined> {
		return this.runs.find(
			(run) =>
				run.userId === actor.userId &&
				run.conversationId === conversationId &&
				['queued', 'running', 'awaiting_approval', 'cancelling'].includes(run.status)
		);
	}

	async insert(actor: ActorContext, run: AgentRun): Promise<AgentRun> {
		const inserted = await this.insertIdempotent(actor, run);
		if (!inserted) throw new ConflictError('Agent request already exists');
		return inserted;
	}

	async insertIdempotent(actor: ActorContext, run: AgentRun): Promise<AgentRun | undefined> {
		if (await this.findByRequestId(actor, run.requestId)) return undefined;
		if (
			this.runs.some(
				(item) =>
					item.conversationId === run.conversationId &&
					['queued', 'running', 'awaiting_approval', 'cancelling'].includes(item.status)
			)
		)
			throw new ValidationError('This conversation already has an active agent run');
		const owned = { ...run, userId: actor.userId };
		this.runs.push(owned);
		return owned;
	}

	async settle(runId: AgentRunId, change: RunSettlementWrite): Promise<AgentRun | undefined> {
		const run = this.runs.find(
			(candidate) => candidate.id === runId && candidate.status === change.expected
		);
		if (!run) return undefined;
		const { expected: _expected, ...values } = change;
		void _expected;
		const updated: AgentRun =
			change.status === 'completed'
				? {
						...run,
						status: change.status,
						finishedAt: change.finishedAt,
						updatedAt: change.updatedAt,
						serializedState: undefined,
						pendingDecisions: change.pendingDecisions
					}
				: { ...run, ...values, serializedState: run.serializedState };
		this.replace(updated);
		return updated;
	}

	async claimAgent(
		runId: AgentRunId,
		change: RunClaimWrite
	): Promise<ResolvedAgentRun | undefined> {
		await this.executionClaim;
		const run = this.runs.find(
			(candidate): candidate is ResolvedAgentRun =>
				candidate.kind === 'agent' && candidate.id === runId && candidate.status === change.expected
		);
		if (!run) return undefined;
		const { expected: _expected, ...values } = change;
		void _expected;
		const updated = { ...run, ...values };
		this.replace(updated);
		return updated;
	}

	async claimWorkflow(
		runId: AgentRunId,
		change: RunClaimWrite
	): Promise<WorkflowAgentRun | undefined> {
		const run = this.runs.find(
			(candidate): candidate is WorkflowAgentRun =>
				candidate.kind === 'workflow' &&
				candidate.id === runId &&
				candidate.status === change.expected
		);
		if (!run) return undefined;
		const { expected: _expected, ...values } = change;
		void _expected;
		const updated = { ...run, ...values };
		this.replace(updated);
		return updated;
	}

	async checkpointAgent(
		runId: AgentRunId,
		change: AgentCheckpointWrite
	): Promise<ResolvedAgentRun | undefined> {
		const run = this.runs.find(
			(candidate): candidate is ResolvedAgentRun =>
				candidate.kind === 'agent' && candidate.id === runId && candidate.status === change.expected
		);
		if (!run) return undefined;
		const { expected: _expected, traceparent, ...values } = change;
		void _expected;
		const updated = { ...run, ...values, traceparent: traceparent ?? undefined };
		this.replace(updated);
		return updated;
	}

	async updateCancellation(
		actor: ActorContext,
		runId: AgentRunId,
		change: RunCancellationWrite
	): Promise<AgentRun> {
		const run = await this.findById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		const updated = { ...run, ...change };
		this.replace(updated);
		return updated;
	}

	async updateAgentProvenance(
		actor: ActorContext,
		runId: AgentRunId,
		change: AgentProvenanceWrite
	): Promise<ResolvedAgentRun> {
		const run = await this.findAgentById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		const updated = { ...run, ...change };
		this.replace(updated);
		return updated;
	}

	async updateAgentContext(
		actor: ActorContext,
		runId: AgentRunId,
		change: AgentContextWrite
	): Promise<PreparedAgentRun> {
		const run = await this.findAgentById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		const updated = { ...run, ...change };
		this.replace(updated);
		return updated;
	}

	async updateWorkflowSettlement(
		actor: ActorContext,
		runId: AgentRunId,
		change: WorkflowSettlementWrite
	): Promise<WorkflowAgentRun> {
		const run = await this.findById(actor, runId);
		if (!run || run.kind !== 'workflow') throw new NotFoundError('Workflow run was not found');
		const updated: WorkflowAgentRun = {
			...run,
			status: change.status,
			finishedAt: change.finishedAt,
			updatedAt: change.updatedAt,
			pendingDecisions: [],
			...(change.status === 'completed'
				? { serializedState: undefined }
				: { failure: change.failure })
		};
		this.replace(updated);
		return updated;
	}

	async updateWorkflowContext(
		actor: ActorContext,
		runId: AgentRunId,
		change: WorkflowContextWrite
	): Promise<WorkflowAgentRun> {
		const run = await this.findById(actor, runId);
		if (!run || run.kind !== 'workflow') throw new NotFoundError('Workflow run was not found');
		const updated = { ...run, ...change };
		this.replace(updated);
		return updated;
	}

	async updateApproval(
		actor: ActorContext,
		runId: AgentRunId,
		change: RunApprovalWrite
	): Promise<AgentRun> {
		const run = await this.findById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		const updated = { ...run, ...change };
		this.replace(updated);
		return updated;
	}

	failedEvent?: AgentEvent['type'];
	async listQueuedAgents(): Promise<readonly ResolvedAgentRun[]> {
		return this.runs.filter(
			(run): run is ResolvedAgentRun => run.kind === 'agent' && run.status === 'queued'
		);
	}
	async listQueuedWorkflows(): Promise<readonly WorkflowAgentRun[]> {
		return this.runs.filter(
			(run): run is WorkflowAgentRun => run.kind === 'workflow' && run.status === 'queued'
		);
	}

	appendNoteActionResult(
		runId: AgentRunId,
		result: NoteActionResult
	): Promise<AgentRunEventRecord> {
		return this.append(runId, 1, noteActionEvent(result));
	}

	async listInterrupted(): Promise<readonly AgentRun[]> {
		return this.runs.filter((run) => run.status === 'running' || run.status === 'cancelling');
	}

	async append(
		runId: AgentRunId,
		attempt: number,
		event: AgentEvent
	): Promise<AgentRunEventRecord> {
		if (event.type === this.failedEvent) throw new Error('Event storage unavailable');
		this.cursor += 1n;
		const record = { cursor: this.cursor.toString(), runId, attempt, event, createdAt: new Date() };
		this.events.push(record);
		return record;
	}

	async replay(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly StoredAgentRunEventRecord[]> {
		// The fake stores what a writer wrote, so every row is readable by
		// construction. A fake must not be able to represent a state production
		// cannot produce, and an unreadable row is one only a real database can hold.
		return this.events
			.filter((event) => event.runId === runId && BigInt(event.cursor) > BigInt(after))
			.map((record) => ({ ...record, kind: 'readable' as const }));
	}

	async latestCursor(actor: ActorContext, runId: AgentRunId): Promise<string> {
		void actor;
		return this.events.filter((event) => event.runId === runId).at(-1)?.cursor ?? '0';
	}

	async reconstructOutput(runId: AgentRunId, attempt: number): Promise<readonly OutputSegment[]> {
		return segmentOutput(
			this.events
				.filter((record) => record.runId === runId && record.attempt === attempt)
				.map((record) => ({
					cursor: record.cursor,
					event: { kind: 'readable', event: record.event }
				}))
		);
	}

	async record(
		actor: ActorContext,
		input: { runId: AgentRunId; callId: string; decision: 'approve' | 'reject'; message?: string }
	): Promise<AgentRunDecisionRecord> {
		const existing = this.decisions.find(
			(item) => item.runId === input.runId && item.callId === input.callId
		);
		if (existing) {
			if (existing.decision !== input.decision || existing.message !== input.message)
				throw new ConflictError('A different decision already exists');
			return existing;
		}
		const record: AgentRunDecisionRecord = { ...input, createdAt: new Date() };
		this.decisions.push(record);
		return record;
	}

	async loadUnconsumed(runId: AgentRunId): Promise<readonly AgentRunDecisionRecord[]> {
		return this.decisions.filter((item) => item.runId === runId && !item.consumedAt);
	}

	async consume(runId: AgentRunId, callId: string, at: Date): Promise<boolean> {
		const index = this.decisions.findIndex(
			(item) => item.runId === runId && item.callId === callId && !item.consumedAt
		);
		if (index < 0) return false;
		this.decisions[index] = { ...this.decisions[index]!, consumedAt: at };
		return true;
	}

	async clearPending(runId: AgentRunId): Promise<void> {
		const run = this.runs.find((r) => r.id === runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		this.replace({ ...run, pendingDecisions: [] });
	}

	snapshot(): RestoreSnapshot {
		const state = structuredClone(this.state());
		return () => {
			this.runs = state.runs;
			this.events = state.events;
			this.decisions = state.decisions;
			this.cursor = state.cursor;
		};
	}

	private state() {
		return {
			runs: this.runs,
			events: this.events,
			decisions: this.decisions,
			cursor: this.cursor
		};
	}

	private replace(run: AgentRun): void {
		this.runs = this.runs.map((item) => (item.id === run.id ? run : item));
	}
}

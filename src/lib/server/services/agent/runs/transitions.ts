import { NotFoundError, RunPreparationCancelled, ValidationError } from '$lib/errors';
import type {
	AgentCheckpointWrite,
	AgentContextWrite,
	AgentExecutionUpdate,
	AgentProvenanceWrite,
	AgentRun,
	AgentRunContext,
	AgentRunId,
	AgentRunStatus,
	PreparedAgentRun,
	ResolvedAgentRun,
	RunApprovalWrite,
	RunCancellationWrite
} from '$lib/models/agent';
import type { ProvenanceId } from '$lib/models/provenance';
import type { DateTime } from '$lib/models/workspace';
import type { AgentRunRepository } from '$lib/server/repositories/agent';

/** The caller holds the run lock through decisions, requeue and its event. */
export interface RunApprovalDecisions {
	getForWrite(runId: AgentRunId): Promise<AgentRun>;
	planApproval(
		run: Pick<AgentRun, 'status' | 'pendingDecisions'>,
		callIds: readonly string[],
		timestamp: DateTime
	): RunApprovalWrite | null;
	persistApproval(runId: AgentRunId, change: RunApprovalWrite): Promise<AgentRun>;
}

/** The controller holds the row lock through persistence and any immediate terminal event. */
export interface RunCancellationDecisions {
	getForWrite(runId: AgentRunId): Promise<AgentRun>;
	planCancellation(status: AgentRunStatus, timestamp: DateTime): RunCancellationWrite | null;
	persistCancellation(runId: AgentRunId, change: RunCancellationWrite): Promise<AgentRun>;
}

/** The controller commits the checkpoint, session and approval events together. */
export interface RunCheckpointWriter {
	prepareCheckpoint(
		previous: Pick<ResolvedAgentRun, 'traceparent'>,
		checkpoint: Pick<
			Extract<AgentExecutionUpdate, { type: 'approval_checkpoint' }>,
			'serializedState' | 'pendingDecisions' | 'traceparent'
		>,
		timestamp: DateTime
	): AgentCheckpointWrite;
	persistCheckpoint(
		runId: AgentRunId,
		change: AgentCheckpointWrite
	): Promise<ResolvedAgentRun | undefined>;
}

/** The controller owns the lock through each targeted write and the start event. */
export interface ChatRunPreparation {
	claim(runId: AgentRunId, timestamp: DateTime): Promise<ResolvedAgentRun | undefined>;
	/** Locks a running chat run; a cancelled or finished run is reported, not returned. */
	getForPreparation(runId: AgentRunId): Promise<ResolvedAgentRun>;
	provenance(
		current: Pick<ResolvedAgentRun, 'provenanceId'>,
		provenanceId: ProvenanceId,
		timestamp: DateTime
	): AgentProvenanceWrite;
	context(
		current: Pick<ResolvedAgentRun, 'contextSnapshot'>,
		context: AgentRunContext,
		timestamp: DateTime
	): AgentContextWrite;
	persistProvenance(runId: AgentRunId, change: AgentProvenanceWrite): Promise<ResolvedAgentRun>;
	persistContext(runId: AgentRunId, change: AgentContextWrite): Promise<PreparedAgentRun>;
}

/** Every state transition of a run, decided here and written through the run repository. */
export interface RunTransitionStore
	extends RunApprovalDecisions, RunCancellationDecisions, RunCheckpointWriter, ChatRunPreparation {}

export class RunTransitions implements RunTransitionStore {
	constructor(private readonly runs: AgentRunRepository) {}

	async getForWrite(runId: AgentRunId): Promise<AgentRun> {
		return this.found(await this.runs.findForWrite(runId));
	}

	private found<T extends AgentRun>(run: T | undefined): T {
		if (!run) throw new NotFoundError('Agent run was not found');
		return run;
	}

	planApproval(
		run: Pick<AgentRun, 'status' | 'pendingDecisions'>,
		callIds: readonly string[],
		timestamp: DateTime
	): RunApprovalWrite | null {
		if (run.status !== 'awaiting_approval' && run.status !== 'queued')
			throw new ValidationError('The agent run is not awaiting approval');
		for (const callId of callIds)
			if (!run.pendingDecisions.some((pending) => pending.callId === callId))
				throw new ValidationError('The pending tool call was not found');
		return run.status === 'queued' ? null : { status: 'queued', updatedAt: timestamp };
	}

	persistApproval(runId: AgentRunId, change: RunApprovalWrite): Promise<AgentRun> {
		return this.runs.updateApproval(runId, change);
	}

	planCancellation(status: AgentRunStatus, timestamp: DateTime): RunCancellationWrite | null {
		switch (status) {
			case 'queued':
				return {
					status: 'cancelled',
					cancelRequestedAt: timestamp,
					finishedAt: timestamp,
					updatedAt: timestamp
				};
			case 'running':
			case 'awaiting_approval':
				return { status: 'cancelling', cancelRequestedAt: timestamp, updatedAt: timestamp };
			case 'cancelling':
			case 'cancelled':
			case 'completed':
			case 'failed':
				return null;
		}
	}

	persistCancellation(runId: AgentRunId, change: RunCancellationWrite): Promise<AgentRun> {
		return this.runs.updateCancellation(runId, change);
	}

	prepareCheckpoint(
		previous: Pick<ResolvedAgentRun, 'traceparent'>,
		checkpoint: Pick<
			Extract<AgentExecutionUpdate, { type: 'approval_checkpoint' }>,
			'serializedState' | 'pendingDecisions' | 'traceparent'
		>,
		timestamp: DateTime
	): AgentCheckpointWrite {
		return {
			expected: 'running',
			status: 'awaiting_approval',
			serializedState: checkpoint.serializedState,
			pendingDecisions: checkpoint.pendingDecisions,
			traceparent: checkpoint.traceparent ?? previous.traceparent ?? null,
			updatedAt: timestamp
		};
	}

	persistCheckpoint(
		runId: AgentRunId,
		change: AgentCheckpointWrite
	): Promise<ResolvedAgentRun | undefined> {
		return this.runs.checkpointAgent(runId, change);
	}

	claim(runId: AgentRunId, timestamp: DateTime): Promise<ResolvedAgentRun | undefined> {
		return this.runs.claimAgent(runId, {
			expected: 'queued',
			status: 'running',
			startedAt: timestamp,
			updatedAt: timestamp
		});
	}

	async getForPreparation(runId: AgentRunId): Promise<ResolvedAgentRun> {
		const run = this.found(await this.runs.findForWrite(runId));
		if (run.kind !== 'agent') throw new ValidationError('The run is not a chat run');
		if (run.status === 'cancelling' || run.status === 'cancelled')
			throw new RunPreparationCancelled();
		if (run.status !== 'running') throw new ValidationError('The agent run is no longer running');
		return run;
	}

	provenance(
		current: Pick<ResolvedAgentRun, 'provenanceId'>,
		provenanceId: ProvenanceId,
		timestamp: DateTime
	): AgentProvenanceWrite {
		return { provenanceId: current.provenanceId ?? provenanceId, updatedAt: timestamp };
	}

	context(
		current: Pick<ResolvedAgentRun, 'contextSnapshot'>,
		context: AgentRunContext,
		timestamp: DateTime
	): AgentContextWrite {
		return { contextSnapshot: current.contextSnapshot ?? context, updatedAt: timestamp };
	}

	persistProvenance(runId: AgentRunId, change: AgentProvenanceWrite): Promise<ResolvedAgentRun> {
		return this.runs.updateAgentProvenance(runId, change);
	}

	persistContext(runId: AgentRunId, change: AgentContextWrite): Promise<PreparedAgentRun> {
		return this.runs.updateAgentContext(runId, change);
	}
}

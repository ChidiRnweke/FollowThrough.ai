import type { ActorContext } from '$lib/models/identity';
import type {
	AgentRun,
	AgentRunId,
	AgentRunStatus,
	WorkflowAgentRun,
	WorkflowSettlementWrite
} from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import { NotFoundError, ValidationError } from '$lib/errors';
import type { AgentRunRepository } from '$lib/server/repositories/agent';

/** Direct workflow run values. Controllers own creation and publication transactions. */
export class AgentRunLedger {
	constructor(private readonly repository: AgentRunRepository) {}

	prepareCreation(
		actor: ActorContext,
		input: Pick<WorkflowAgentRun, 'conversationId' | 'model' | 'executionMode' | 'contextSnapshot'>,
		timestamp: DateTime
	): WorkflowAgentRun {
		return {
			kind: 'workflow',
			id: crypto.randomUUID() as AgentRunId,
			userId: actor.userId,
			...input,
			status: 'running',
			requestId: crypto.randomUUID(),
			pendingDecisions: [],
			definitionVersion: 2,
			createdAt: timestamp,
			updatedAt: timestamp,
			startedAt: timestamp
		};
	}

	persistCreated(actor: ActorContext, run: WorkflowAgentRun): Promise<AgentRun> {
		return this.repository.insert(actor, run);
	}

	async getForWrite(actor: ActorContext, runId: AgentRunId): Promise<WorkflowAgentRun> {
		const run = await this.repository.findForWrite(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		if (run.kind !== 'workflow') throw new ValidationError('The run is not a workflow');
		return run;
	}

	prepareCompletion(status: AgentRunStatus, timestamp: DateTime): WorkflowSettlementWrite {
		if (status !== 'running') throw new ValidationError('The workflow run is no longer running');
		return {
			status: 'completed',
			finishedAt: timestamp,
			updatedAt: timestamp,
			serializedState: null,
			pendingDecisions: []
		};
	}

	prepareFailure(
		status: AgentRunStatus,
		failure: string,
		timestamp: DateTime
	): WorkflowSettlementWrite | null {
		if (status !== 'running') return null;
		return {
			status: 'failed',
			failure,
			finishedAt: timestamp,
			updatedAt: timestamp,
			pendingDecisions: []
		};
	}

	persistSettlement(
		actor: ActorContext,
		runId: AgentRunId,
		change: WorkflowSettlementWrite
	): Promise<WorkflowAgentRun> {
		return this.repository.updateWorkflowSettlement(actor, runId, change);
	}
}

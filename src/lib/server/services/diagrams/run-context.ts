import { NotFoundError, ValidationError } from '$lib/errors';
import type {
	AgentRunId,
	WorkflowAgentRun,
	WorkflowRunContext,
	WorkflowContextWrite
} from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { AgentRunRepository } from '$lib/server/repositories/agent';

export interface DiagramRunContexts {
	getForWrite(runId: AgentRunId): Promise<WorkflowAgentRun>;
	prepare(
		run: Pick<WorkflowAgentRun, 'status' | 'contextSnapshot'>,
		context: Extract<WorkflowRunContext, { kind: 'diagram'; state: 'prepared' }>,
		timestamp: DateTime
	): WorkflowContextWrite;
	persist(runId: AgentRunId, change: WorkflowContextWrite): Promise<WorkflowAgentRun>;
}
export class DiagramRunContext implements DiagramRunContexts {
	constructor(private readonly runs: AgentRunRepository) {}

	async getForWrite(runId: AgentRunId): Promise<WorkflowAgentRun> {
		const run = await this.runs.findForWrite(runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		if (run.kind !== 'workflow')
			throw new ValidationError('Only workflow runs accept workflow context updates');
		return run;
	}

	prepare(
		run: Pick<WorkflowAgentRun, 'status' | 'contextSnapshot'>,
		context: Extract<WorkflowRunContext, { kind: 'diagram'; state: 'prepared' }>,
		timestamp: DateTime
	): WorkflowContextWrite {
		if (run.status !== 'running') throw new ValidationError('The diagram run is no longer running');
		if (run.contextSnapshot.kind !== 'diagram' && run.contextSnapshot.kind !== 'diagram_action')
			throw new ValidationError('The run does not contain a diagram request');
		return {
			contextSnapshot:
				run.contextSnapshot.kind === 'diagram_action'
					? {
							...run.contextSnapshot,
							prepared: { context: context.context, provenanceId: context.provenanceId }
						}
					: context,
			updatedAt: timestamp
		};
	}

	persist(runId: AgentRunId, change: WorkflowContextWrite): Promise<WorkflowAgentRun> {
		return this.runs.updateWorkflowContext(runId, change);
	}
}

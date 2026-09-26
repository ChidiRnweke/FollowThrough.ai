import { NotFoundError, ValidationError } from '$lib/errors';
import type { AgentRun, AgentRunId, RunApprovalWrite } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { AgentRunRepository } from '$lib/server/repositories/agent';

/** The caller holds the run lock through decisions, requeue and its event. */
export class RunApprovals {
	constructor(private readonly runs: AgentRunRepository) {}

	async getForWrite(actor: ActorContext, runId: AgentRunId): Promise<AgentRun> {
		const run = await this.runs.findForWrite(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return run;
	}

	plan(
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

	persist(actor: ActorContext, runId: AgentRunId, change: RunApprovalWrite): Promise<AgentRun> {
		return this.runs.updateApproval(actor, runId, change);
	}
}

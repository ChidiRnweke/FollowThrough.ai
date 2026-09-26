import type { ActorContext } from '$lib/models/identity';
import type { AgentRun, AgentRunId, AgentRunStatus, RunCancellationWrite } from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import type { AgentRunRepository } from '$lib/server/repositories/agent';
import { NotFoundError } from '$lib/errors';
/** The controller holds the row lock through persistence and any immediate terminal event. */
export class RunCancellation {
	constructor(private readonly runs: AgentRunRepository) {}
	async getForWrite(actor: ActorContext, runId: AgentRunId): Promise<AgentRun> {
		const run = await this.runs.findForWrite(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		return run;
	}
	plan(status: AgentRunStatus, timestamp: DateTime): RunCancellationWrite | null {
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
	persist(actor: ActorContext, runId: AgentRunId, change: RunCancellationWrite): Promise<AgentRun> {
		return this.runs.updateCancellation(actor, runId, change);
	}
}

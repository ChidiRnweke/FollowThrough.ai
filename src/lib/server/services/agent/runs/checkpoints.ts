import type {
	AgentCheckpointWrite,
	AgentExecutionUpdate,
	AgentRunId,
	ResolvedAgentRun
} from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import type { AgentRunRepository } from '$lib/server/repositories/agent';

/** The controller commits the checkpoint, session and approval events together. */
export class RunCheckpoints {
	constructor(private readonly runs: AgentRunRepository) {}

	prepare(
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

	persist(runId: AgentRunId, change: AgentCheckpointWrite): Promise<ResolvedAgentRun | undefined> {
		return this.runs.checkpointAgent(runId, change);
	}
}

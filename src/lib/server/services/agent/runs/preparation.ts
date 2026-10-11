import { NotFoundError, ValidationError, RunPreparationCancelled } from '$lib/errors';
import type {
	AgentContextWrite,
	AgentProvenanceWrite,
	AgentRunContext,
	AgentRunId,
	PreparedAgentRun,
	ResolvedAgentRun
} from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { ProvenanceId } from '$lib/models/provenance';
import type { DateTime } from '$lib/models/workspace';
import type { AgentRunRepository } from '$lib/server/repositories/agent';

export interface ChatRunPreparation {
	claim(runId: AgentRunId, timestamp: DateTime): Promise<ResolvedAgentRun | undefined>;
	getForWrite(runId: AgentRunId): Promise<ResolvedAgentRun>;
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

/** The controller owns the lock through each targeted write and the start event. */
export class RunPreparation implements ChatRunPreparation {
	constructor(private readonly runs: AgentRunRepository) {}

	claim(runId: AgentRunId, timestamp: DateTime): Promise<ResolvedAgentRun | undefined> {
		return this.runs.claimAgent(runId, {
			expected: 'queued',
			status: 'running',
			startedAt: timestamp,
			updatedAt: timestamp
		});
	}

	async getForWrite(runId: AgentRunId): Promise<ResolvedAgentRun> {
		const run = await this.runs.findForWrite(runId);
		if (!run) throw new NotFoundError('Agent run was not found');
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

import { NotFoundError, ValidationError } from '$lib/errors';
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

export class RunPreparationCancelled extends Error {
	constructor() {
		super('The run was cancelled during preparation');
	}
}

/** The controller owns the lock through each targeted write and the start event. */
export class RunPreparation {
	constructor(private readonly runs: AgentRunRepository) {}

	claim(runId: AgentRunId, timestamp: DateTime): Promise<ResolvedAgentRun | undefined> {
		return this.runs.claimAgent(runId, {
			expected: 'queued',
			status: 'running',
			startedAt: timestamp,
			updatedAt: timestamp
		});
	}

	async getForWrite(actor: ActorContext, runId: AgentRunId): Promise<ResolvedAgentRun> {
		const run = await this.runs.findForWrite(actor, runId);
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

	persistProvenance(
		actor: ActorContext,
		runId: AgentRunId,
		change: AgentProvenanceWrite
	): Promise<ResolvedAgentRun> {
		return this.runs.updateAgentProvenance(actor, runId, change);
	}

	persistContext(
		actor: ActorContext,
		runId: AgentRunId,
		change: AgentContextWrite
	): Promise<PreparedAgentRun> {
		return this.runs.updateAgentContext(actor, runId, change);
	}
}

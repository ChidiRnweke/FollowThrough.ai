import {
	decideRunSettlement,
	type AgentRun,
	type AgentRunId,
	type RunSettlementOutcome,
	type RunSettlementResult
} from '$lib/models/agent';
import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type { AgentRunRepository, AgentRunEventRepository } from '$lib/server/repositories/agent';

export class RunSettlements {
	constructor(
		private readonly runs: AgentRunRepository,
		private readonly events: AgentRunEventRepository,
		private readonly transactions: AtomicOperation
	) {}
	settle(
		runId: AgentRunId,
		outcome: RunSettlementOutcome,
		materialize: (run: AgentRun) => Promise<void>
	): Promise<RunSettlementResult> {
		return this.transactions.run(async () => {
			const plan = decideRunSettlement(runId, outcome, new Date().toISOString() as DateTime);
			const run = await this.runs.transition(runId, plan.expected, plan.status, plan.patch);
			if (!run) return { kind: 'lost' };
			await materialize(run);
			for (const event of plan.events) await this.events.append(runId, 1, event);
			return { kind: 'settled', run };
		});
	}
}

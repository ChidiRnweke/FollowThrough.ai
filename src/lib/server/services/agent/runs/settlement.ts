import { NotFoundError } from '$lib/errors';
import type {
	AgentRunId,
	RunSettlementOutcome,
	RunSettlementResult,
	RunSettlementClaim,
	RunSettlementPlan
} from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import type { AgentRunRepository, AgentRunEventRepository } from '$lib/server/repositories/agent';
export interface RunSettlement {
	claim(runId: AgentRunId, outcome: RunSettlementOutcome): Promise<RunSettlementClaim>;
	complete(claim: Extract<RunSettlementClaim, { kind: 'claimed' }>): Promise<RunSettlementResult>;
}
/** The caller owns the transaction containing the claim, saved output and terminal events. */
export class RunSettlements implements RunSettlement {
	constructor(
		private readonly runs: AgentRunRepository,
		private readonly events: AgentRunEventRepository
	) {}
	async claim(runId: AgentRunId, outcome: RunSettlementOutcome): Promise<RunSettlementClaim> {
		const plan = this.plan(runId, outcome, new Date().toISOString() as DateTime);
		const run = await this.runs.settle(runId, plan.change);
		return run ? { kind: 'claimed', run, events: plan.events } : { kind: 'lost' };
	}
	async complete(
		claim: Extract<RunSettlementClaim, { kind: 'claimed' }>
	): Promise<RunSettlementResult> {
		for (const event of claim.events) await this.events.append(claim.run.id, 1, event);
		const run = await this.runs.findById({ userId: claim.run.userId }, claim.run.id);
		if (!run) throw new NotFoundError('Agent run was not found');
		return { kind: 'settled', run };
	}
	private plan(
		runId: AgentRunId,
		outcome: RunSettlementOutcome,
		finishedAt: DateTime
	): RunSettlementPlan {
		switch (outcome.kind) {
			case 'completed':
			case 'workflow_completed':
				return {
					change: {
						expected: 'running',
						status: 'completed',
						finishedAt,
						updatedAt: finishedAt,
						serializedState: null,
						pendingDecisions: []
					},
					events: [
						...(outcome.kind === 'workflow_completed'
							? [
									{
										type: 'workflow_result' as const,
										action: outcome.action,
										result: outcome.result
									}
								]
							: []),
						{
							type: 'completed',
							runId,
							conversationId: outcome.conversationId,
							model: outcome.model
						}
					]
				};
			case 'cancelled':
				return {
					change: {
						expected: 'cancelling',
						status: 'cancelled',
						finishedAt,
						updatedAt: finishedAt,
						failure: 'The request was cancelled'
					},
					events: [{ type: 'cancelled', runId, message: outcome.message }]
				};
			case 'failed':
				return {
					change: {
						expected: 'running',
						status: 'failed',
						finishedAt,
						updatedAt: finishedAt,
						failure: outcome.message,
						providerErrorCode: outcome.code
					},
					events: [
						{
							type: 'failed',
							runId,
							code: outcome.code,
							message: outcome.message,
							retryable: outcome.retryable
						}
					]
				};
		}
	}
}

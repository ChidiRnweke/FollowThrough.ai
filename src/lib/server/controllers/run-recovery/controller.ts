import type {
	AgentRunRepository,
	AgentRunExecutor,
	RunSettlement
} from '$lib/server/services/agent/runs/execution-contracts';
import type { AgentRunId } from '$lib/models/agent';

/** Startup recovery uses the same terminal writes as live execution. */
export class RunRecovery {
	constructor(
		private readonly runs: AgentRunRepository,
		private readonly executor: AgentRunExecutor,
		private readonly settlements: RunSettlement,
		private readonly events: { notify(runId: AgentRunId): void }
	) {}
	async recover(): Promise<number> {
		const interrupted = await this.runs.listInterrupted();
		for (const run of interrupted) {
			if (run.kind === 'agent') {
				if (run.status === 'cancelling') await this.executor.finishCancellation(run.id);
				else await this.executor.failRun(run.id, new Error('Process restarted'));
			} else {
				const result = await this.settlements.settle(
					run.id,
					run.status === 'cancelling'
						? { kind: 'cancelled', message: 'Generation stopped' }
						: {
								kind: 'failed',
								code: 'PROCESS_RESTARTED',
								message: 'Process restarted',
								retryable: true
							},
					async () => {}
				);
				if (result.kind === 'settled') this.events.notify(run.id);
			}
		}
		return interrupted.length;
	}
}

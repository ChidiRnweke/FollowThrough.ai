import type { AgentRunId } from '$lib/models/agent';
import type { AgentRunRepository } from '$lib/server/repositories/agent';
import type { AgentRunNotificationRepository } from '$lib/server/repositories/agent/run-notifications';

export interface RunSignals {
	/** Calls `listener` after each committed change to the run. Resolves with the unsubscribe. */
	observe(runId: AgentRunId, listener: () => void): Promise<() => Promise<void>>;
	/**
	 * Aborts `execution` once the run is asked to cancel, by a request in this or any other
	 * process. Resolves with the function that stops watching.
	 */
	abortOnCancel(runId: AgentRunId, execution: AbortController): Promise<() => Promise<void>>;
}

export class RunSignalService implements RunSignals {
	constructor(
		private readonly notifications: AgentRunNotificationRepository,
		private readonly runs: Pick<AgentRunRepository, 'findStatus'>
	) {}

	observe(runId: AgentRunId, listener: () => void): Promise<() => Promise<void>> {
		return this.notifications.listen(runId, listener);
	}

	async abortOnCancel(runId: AgentRunId, execution: AbortController): Promise<() => Promise<void>> {
		const check = async () => {
			const status = await this.runs.findStatus(runId);
			if (status === 'cancelling' || status === 'cancelled') execution.abort();
		};
		const stop = await this.notifications.listen(runId, () => {
			// chisel-ignore fail-loudly:silent-catch -- a failed status read leaves the run executing; the next notification reads again, and the canceller's grace timer settles the run regardless.
			check().catch((error) =>
				console.error(`[agent-run] Could not read cancellation for ${runId}:`, error)
			);
		});
		// A cancellation committed before the listener started has no notification left to deliver.
		try {
			await check();
		} catch (error) {
			await stop();
			throw error;
		}
		return stop;
	}
}

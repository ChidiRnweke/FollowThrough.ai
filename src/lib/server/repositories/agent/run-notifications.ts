import type { AgentRunId } from '$lib/models/agent';

export interface AgentRunNotificationRepository {
	/**
	 * Calls `listener` after each committed change to the run or its event log, from any process.
	 * Resolves once listening, with the function that stops it.
	 */
	listen(runId: AgentRunId, listener: () => void): Promise<() => Promise<void>>;
}

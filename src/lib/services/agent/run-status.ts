import { terminalAgentRunStatuses, type AgentRunStatus } from '$lib/models/agent';

/** Terminal runs have no further execution or approval work to resume. */
export const isTerminalAgentRunStatus = (status: AgentRunStatus): boolean =>
	terminalAgentRunStatuses.includes(status);

export const isRunEventStreamComplete = (
	status: AgentRunStatus,
	deliveredCursor: string,
	latestCursor: string
): boolean => isTerminalAgentRunStatus(status) && BigInt(deliveredCursor) >= BigInt(latestCursor);

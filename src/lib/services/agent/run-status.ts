import { terminalAgentRunStatuses, type AgentRunStatus } from '$lib/models/agent';

export interface AgentRunStatusRules {
	isTerminal(status: AgentRunStatus): boolean;
	eventStreamComplete(
		status: AgentRunStatus,
		deliveredCursor: string,
		latestCursor: string
	): boolean;
}
/** Terminal runs have no further execution or approval work to resume. */
export class AgentRunStatusService implements AgentRunStatusRules {
	isTerminal(status: AgentRunStatus): boolean {
		return terminalAgentRunStatuses.includes(status);
	}
	eventStreamComplete(
		status: AgentRunStatus,
		deliveredCursor: string,
		latestCursor: string
	): boolean {
		return this.isTerminal(status) && BigInt(deliveredCursor) >= BigInt(latestCursor);
	}
}

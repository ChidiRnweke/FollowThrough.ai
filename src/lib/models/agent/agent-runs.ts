type AgentRunStatus =
	'queued' | 'running' | 'awaiting_approval' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
type AgentRunId = string & { readonly __brand: 'AgentRunId' };

export const terminalAgentRunStatuses: readonly AgentRunStatus[] = [
	'completed',
	'failed',
	'cancelled'
];

export interface AgentRunDecisionRecord {
	readonly runId: AgentRunId;
	readonly callId: string;
	readonly decision: 'approve' | 'reject';
	readonly message?: string;
	readonly createdAt: Date;
	readonly consumedAt?: Date;
}

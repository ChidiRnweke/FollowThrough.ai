import type { AgentRunStatus, PendingAgentDecision } from './domain';
import type { AgentRunId, DateTime } from './shared';
import type { AgentEvent } from './workflows';
import { InvalidTransitionError } from './errors';

const transitions: Readonly<Record<AgentRunStatus, readonly AgentRunStatus[]>> = {
	queued: ['running', 'cancelled'],
	running: ['awaiting_approval', 'queued', 'cancelling', 'completed', 'failed'],
	awaiting_approval: ['queued', 'cancelling'],
	cancelling: ['cancelled'],
	completed: [],
	failed: [],
	cancelled: []
};

export const terminalAgentRunStatuses: readonly AgentRunStatus[] = [
	'completed',
	'failed',
	'cancelled'
];

export const nonTerminalAgentRunStatuses: readonly AgentRunStatus[] = [
	'queued',
	'running',
	'awaiting_approval',
	'cancelling'
];

export const isTerminalAgentRunStatus = (status: AgentRunStatus): boolean =>
	terminalAgentRunStatuses.includes(status);

export const canTransitionAgentRun = (from: AgentRunStatus, to: AgentRunStatus): boolean =>
	transitions[from].includes(to);

export function assertAgentRunTransition(from: AgentRunStatus, to: AgentRunStatus): void {
	if (!canTransitionAgentRun(from, to))
		throw new InvalidTransitionError(`Agent run cannot transition from ${from} to ${to}`);
}

export interface AgentRunEventRecord {
	readonly cursor: string;
	readonly runId: AgentRunId;
	readonly attempt: number;
	readonly event: AgentEvent;
	readonly createdAt: Date;
}

export type AgentExecutionUpdate =
	| { readonly type: 'event'; readonly event: AgentEvent }
	| {
			readonly type: 'approval_checkpoint';
			readonly serializedState: string;
			readonly pendingDecisions: readonly PendingAgentDecision[];
			readonly sessionItems: readonly Readonly<Record<string, unknown>>[];
	  }
	| {
			readonly type: 'completed';
			readonly sessionItems: readonly Readonly<Record<string, unknown>>[];
	  };

export class AgentProviderFailure extends Error {
	constructor(
		message: string,
		public readonly providerCode: string,
		public readonly transient: boolean,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = 'AgentProviderFailure';
	}
}

export interface AgentRunDecisionRecord {
	readonly runId: AgentRunId;
	readonly callId: string;
	readonly decision: 'approve' | 'reject';
	readonly message?: string;
	readonly createdAt: Date;
	readonly consumedAt?: Date;
}

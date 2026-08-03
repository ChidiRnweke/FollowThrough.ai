type AgentRunStatus =
	'queued' | 'running' | 'awaiting_approval' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
type AgentRunId = string & { readonly __brand: 'AgentRunId' };
type ConversationId = string & { readonly __brand: 'ConversationId' };
interface PendingAgentDecision {
	readonly callId: string;
	readonly toolName: string;
	readonly arguments: Readonly<Record<string, unknown>>;
}
type AgentEvent =
	| {
			readonly type: 'run_queued';
			readonly runId: AgentRunId;
			readonly attempt: number;
			readonly reason: 'submitted' | 'retry' | 'resumed';
	  }
	| { readonly type: 'run_started'; readonly runId: AgentRunId; readonly attempt: number }
	| { readonly type: 'text_delta'; readonly text: string }
	| { readonly type: 'reasoning_delta'; readonly text: string }
	| {
			readonly type: 'tool_started';
			readonly callId: string;
			readonly name: string;
			readonly arguments: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly type: 'tool_completed';
			readonly callId: string;
			readonly name: string;
			readonly output?: unknown;
			readonly failure?: string;
	  }
	| {
			readonly type: 'approval_required';
			readonly runId: AgentRunId;
			readonly callId: string;
			readonly name: string;
			readonly arguments: Readonly<Record<string, unknown>>;
	  }
	// This self-contained persistence projection must remain compatible with
	// every domain-owned suggestion variant without importing another model.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	| { readonly type: 'suggestion'; readonly suggestion: any }
	| {
			readonly type: 'failed';
			readonly runId?: AgentRunId;
			readonly code: string;
			readonly message: string;
			readonly retryable: boolean;
	  }
	| { readonly type: 'cancelled'; readonly runId: AgentRunId; readonly message: string }
	| {
			readonly type: 'completed';
			readonly conversationId: ConversationId;
			readonly runId?: AgentRunId;
			readonly model?: string;
	  }
	| { readonly type: 'resources_stale'; readonly resources: readonly string[] };

class InvalidAgentRunTransition extends Error {
	readonly code = 'INVALID_TRANSITION';
}

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
		throw new InvalidAgentRunTransition(`Agent run cannot transition from ${from} to ${to}`);
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
			readonly traceparent?: string;
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

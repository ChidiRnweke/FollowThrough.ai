import type {
	AgentRunEventRecord,
	AgentRunId,
	AgentRunReceipt,
	AgentRunSnapshot,
	SubmitAgentRunInput
} from '$lib/models/agent';

export interface AgentRunEventConnection {
	close(): void;
}

export interface AgentRunTransport {
	submit(input: SubmitAgentRunInput): Promise<AgentRunReceipt>;
	get(runId: AgentRunId): Promise<AgentRunSnapshot>;
	/** Decides every parked call in one round trip; the run resumes once, not once per card. */
	decideMany(input: {
		runId: AgentRunId;
		callIds: readonly string[];
		decision: 'approve' | 'reject';
		message?: string;
	}): Promise<AgentRunSnapshot>;
	cancel(runId: AgentRunId): Promise<AgentRunSnapshot>;
	retry(runId: AgentRunId, requestId: string): Promise<AgentRunReceipt>;
	openEvents(input: {
		runId: AgentRunId;
		after: string;
		onOpen: () => void;
		onEvent: (record: AgentRunEventRecord) => void;
		onError: () => void;
	}): AgentRunEventConnection;
}

export interface StoredAgentRunClientState {
	readonly runId?: AgentRunId;
	readonly cursor: string;
	readonly attempt: number;
	readonly pendingRequestId?: string;
}

export type StoredAgentRunClientStateResult =
	| { readonly kind: 'missing' }
	| { readonly kind: 'valid'; readonly state: StoredAgentRunClientState }
	| { readonly kind: 'corrupt'; readonly message: string };

export interface AgentRunClientStorage {
	load(): StoredAgentRunClientStateResult;
	save(state: StoredAgentRunClientState): void;
	clear(): void;
}

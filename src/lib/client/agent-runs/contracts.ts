import type {
	AgentRunEventRecord,
	AgentRunId,
	AgentRunReceipt,
	AgentRunSnapshot,
	ConversationId,
	SubmitAgentRunInput
} from '$lib/models';

export interface AgentRunEventConnection {
	close(): void;
}

export interface AgentRunTransport {
	submit(input: SubmitAgentRunInput): Promise<AgentRunReceipt>;
	get(runId: AgentRunId): Promise<AgentRunSnapshot>;
	decide(input: {
		runId: AgentRunId;
		callId: string;
		decision: 'approve' | 'reject';
		message?: string;
	}): Promise<AgentRunSnapshot>;
	cancel(runId: AgentRunId): Promise<AgentRunSnapshot>;
	retry(runId: AgentRunId, requestId: string): Promise<AgentRunReceipt>;
	getSession(
		conversationId: ConversationId
	): Promise<Awaited<ReturnType<typeof import('$lib/remote/chat.remote').getSession>>>;
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

export interface AgentRunClientStorage {
	load(): StoredAgentRunClientState;
	save(state: StoredAgentRunClientState): void;
	clear(): void;
}

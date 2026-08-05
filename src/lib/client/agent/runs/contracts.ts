import type {
	AgentRunEventRecord,
	AgentRunId,
	AgentRunReceipt,
	AgentRunSnapshot,
	ConversationId,
	SubmitAgentRunInput
} from '$lib/models/agent';
import type { getSession } from '$lib/remote/agent/chat.remote';

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
	getSession(conversationId: ConversationId): Promise<Awaited<ReturnType<typeof getSession>>>;
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

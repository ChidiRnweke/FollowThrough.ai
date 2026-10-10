import type {
	AgentRunId,
	AgentRunStatus,
	ConversationId,
	AgentExecutionMode
} from '$lib/models/agent';
import type { MutableChatEntry } from '$lib/models/chat';
import type { ContextChip, MentionHistory } from '$lib/models/chat';
import { createMentionHistory } from '$lib/models/chat';
import type { ChatHandoff } from '$lib/models/chat';
import type { AgentRunEventConnection } from '$lib/controllers/agent/run-transport';
import type { WorkspaceResourcesController } from '$lib/controllers/workspace/resources';
export class ChatSessionState {
	entries = $state<MutableChatEntry[]>([]);
	/** True while a conversation's transcript is being fetched, so the thread can show a skeleton. */
	loading = $state(false);
	conversationId = $state<ConversationId | undefined>(undefined);
	modelOverride = $state<string | null>(null);
	visionModelOverride = $state<string | null>(null);
	executionModeOverride = $state<AgentExecutionMode>('approval_required');
	initialized = $state(false);
	/** True while a decision is in flight, so a bundle cannot be answered twice. */
	deciding = $state(false);
	chips = $state<ContextChip[]>([]);
	mentionDraft = $state<MentionHistory>(createMentionHistory(''));
	/** The automatic chip the user waved off, by `chipKeyOf`, so it stays off for that one resource. */
	autoChipDismissedFor = $state<string | undefined>(undefined);
	/**
	 * The one highlighted passage the user has waved off, by chip id. Not cleared on send:
	 * the text stays highlighted after a message goes out, and re-attaching a passage
	 * somebody explicitly detached would undo their decision behind their back.
	 */
	dismissedSelectionId = $state<string | undefined>(undefined);
	/**
	 * A prompt written by an invocation point elsewhere in the app, waiting for the
	 * composer to pick it up. `chat-handoff` covers the case where the panel has yet
	 * to mount; this covers the docked panel, which is mounted already and so never
	 * runs the `onMount` that consumes the handoff.
	 */
	staged = $state<ChatHandoff | undefined>(undefined);
	runId = $state<AgentRunId | undefined>(undefined);
	runStatus = $state<AgentRunStatus | undefined>(undefined);
	cursor = $state('0');
	appliedCursor = '0';
	attempt = $state(0);
	connection = $state<'detached' | 'connected' | 'reconnecting' | 'offline'>('detached');
	persistenceError = $state<string | undefined>(undefined);
	hydratedConversationId?: ConversationId;
	resources: WorkspaceResourcesController | null = null;
	generation = 0;
	connectionGeneration = 0;
	liveConfirmed = $state(true);
	historyError = $state<string | null>(null);
	refreshing: Promise<void> | null = null;
	hydrating: { generation: number; promise: Promise<void> } | null = null;
	defaultExecutionMode: AgentExecutionMode = 'approval_required';
	eventConnection?: AgentRunEventConnection;
	activeReply?: MutableChatEntry;
	released = false;
}

import type {
	AgentExecutionMode,
	Conversation,
	ConversationId,
	RunAgentInput,
	StoredMessage
} from '$lib/models/agent';
import type { WorkspaceValues } from '$lib/models/workspace-records';
import type { ContextChip, MentionHistory } from '$lib/models/chat';
import type { ChatHandoff } from './chat-handoff';
import type { ChatToolActivity } from './chat-tools';
import { z } from 'zod';

export type { ContextChip, ResourceChip } from '$lib/models/chat';

export type { ChatToolActivity } from './chat-tools';
export type { SelectionChip } from '$lib/models/chat';

export const STORAGE_KEY_PREFIX = 'followthrough.agent.conversation';
const browser = typeof window !== 'undefined';

/**
 * Identifies one chat session for its whole life.
 *
 * Minted on the client, because a new chat has no `ConversationId` until the
 * server assigns one on first submit. Re-keying the session at that moment
 * would have to rewrite the registry entry, the storage keys, the tab id and
 * the URL mid-run, so the key is fixed and the conversation id is recorded
 * alongside it instead.
 */
export type ChatSessionKey = string;

export const mintChatSessionKey = (): ChatSessionKey => crypto.randomUUID();

/**
 * Bind a session key to an existing conversation before anything mounts it.
 *
 * Opening a saved diagram beside the conversation that produced it needs a chat
 * tab that already knows which conversation it shows, and the tab id carries only
 * the session key. The pairing goes where a session's conversation always lives —
 * session storage — so the pane adopts it in `initialize`, without this having to
 * build a store, hydrate it and tear it down just to write one field.
 */
export const rememberConversation = (
	sessionKey: ChatSessionKey,
	conversationId: ConversationId
): void => {
	if (!browser) return;
	const key = `${STORAGE_KEY_PREFIX}.${sessionKey}`;
	sessionStorage.setItem(key, JSON.stringify({ ...persistedConversation(key), conversationId }));
};
interface PersistedConversationChoices {
	conversationId?: ConversationId;
	modelOverride?: string | null;
	visionModelOverride?: string | null;
	executionModeOverride?: AgentExecutionMode;
}

export type PersistedConversationResult =
	| { readonly kind: 'missing' }
	| { readonly kind: 'valid'; readonly choices: PersistedConversationChoices }
	| { readonly kind: 'corrupt'; readonly message: string };

const persistedConversationSchema = z.object({
	conversationId: z
		.string()
		.uuid()
		.transform((value) => value as ConversationId)
		.optional(),
	modelOverride: z.string().nullable().optional(),
	visionModelOverride: z.string().nullable().optional(),
	executionModeOverride: z.enum(['approval_required', 'auto_accept']).optional()
});

export const persistedConversation = (key: string): PersistedConversationResult => {
	if (!browser) return { kind: 'missing' };
	const stored = sessionStorage.getItem(key);
	if (stored === null) return { kind: 'missing' };
	try {
		return { kind: 'valid', choices: persistedConversationSchema.parse(JSON.parse(stored)) };
	} catch (error) {
		return {
			kind: 'corrupt',
			message: error instanceof Error ? error.message : 'Saved conversation state is unreadable'
		};
	}
};

export type { ChatPart, ChatEntry } from '$lib/models/chat';
import type { ChatEntry } from '$lib/models/chat';

/** The prose of a turn, with tool activity left out. */
export const entryText = (entry: ChatEntry): string =>
	entry.parts
		.filter((part) => part.kind === 'text')
		.map((part) => part.text)
		.join('\n');

/** Every tool call of one turn, in call order — what the turn's activity summary reads. */
export const entryTools = (entry: ChatEntry): ChatToolActivity[] =>
	entry.parts.filter((part) => part.kind === 'tool').map((part) => part.tool);

/**
 * Restored journal content is untyped JSON: only re-emit images whose shape we
 * recognise, so a malformed record degrades to the text-only turn it was before.
 */

/** A conversation as this device holds it, read when a chat opens. */
export type ChatHistory =
	| {
			readonly kind: 'ready';
			readonly conversation: Conversation;
			readonly messages: readonly StoredMessage[];
			readonly latestRun: WorkspaceValues['agent_runs'] | null;
	  }
	| { readonly kind: 'stopped' }
	| { readonly kind: 'failure'; readonly message: string };
/** Where a chat reads its history and how it refreshes after a run changed server records. */
export interface ChatHistorySource {
	/** The account can send: its workspace is open and online. */
	readonly writable: boolean;
	read(conversationId: ConversationId): Promise<ChatHistory>;
	refresh(): Promise<void>;
}

/** One chat as its panel drives it: the transcript, the composer's choices and its actions. */
export interface ChatSession {
	readonly sessionKey: ChatSessionKey;
	readonly conversationId: ConversationId | undefined;
	readonly entries: ChatEntry[];
	readonly loading: boolean;
	readonly initialized: boolean;
	readonly deciding: boolean;
	readonly connection: 'detached' | 'connected' | 'reconnecting' | 'offline';
	readonly historyError: string | null;
	readonly persistenceError: string | undefined;
	readonly canExecute: boolean;
	readonly isStreaming: boolean;
	modelOverride: string | null;
	visionModelOverride: string | null;
	executionModeOverride: AgentExecutionMode;
	chips: ContextChip[];
	mentionDraft: MentionHistory;
	autoChipDismissedFor: string | undefined;
	dismissedSelectionId: string | undefined;
	staged: ChatHandoff | undefined;
	initialize(defaultMode: AgentExecutionMode): void;
	/** Write a prompt into the composer without sending it. */
	stage(request: ChatHandoff): void;
	/** Close the run stream; the surface showing this chat has gone. */
	detach(): void;
	hydrate(history: ChatHistorySource): Promise<void>;
	switchToConversation(id: ConversationId, history: ChatHistorySource): Promise<void>;
	revalidate(): Promise<void>;
	clear(): void;
	persistConversationChoices(): void;
	resetCorruptPersistence(): void;
	addChip(chip: ContextChip): void;
	removeChip(chip: ContextChip): void;
	resolveSuggestion(suggestionId: string): void;
	precedingUserEntry(reply: ChatEntry): ChatEntry | undefined;
	send(
		input: Omit<RunAgentInput, 'conversationId'> & { readonly retryUserOrdinal?: number }
	): Promise<void>;
	resubmit(entry: ChatEntry, input: Omit<RunAgentInput, 'conversationId'>): Promise<boolean>;
	retry(reply: ChatEntry): Promise<void>;
	stop(): Promise<void>;
	decideAll(
		reply: ChatEntry,
		tools: readonly ChatToolActivity[],
		decision: 'approve' | 'reject'
	): Promise<void>;
}

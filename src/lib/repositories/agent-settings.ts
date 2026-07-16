import type {
	ActorContext,
	AgentPreferences,
	AgentRun,
	AgentRunId,
	AgentSessionItem,
	ConversationId
} from '$lib/models';

export interface AgentPreferencesRepository {
	get(actor: ActorContext): Promise<AgentPreferences | undefined>;
	upsert(actor: ActorContext, preferences: AgentPreferences): Promise<AgentPreferences>;
}

export interface AgentRunRepository {
	findById(actor: ActorContext, id: AgentRunId): Promise<AgentRun | undefined>;
	findAwaitingByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined>;
	insert(actor: ActorContext, run: AgentRun): Promise<AgentRun>;
	update(actor: ActorContext, run: AgentRun): Promise<AgentRun>;
}

export interface AgentSessionRepository {
	list(
		actor: ActorContext,
		conversationId: ConversationId,
		limit?: number
	): Promise<readonly AgentSessionItem[]>;
	append(
		actor: ActorContext,
		conversationId: ConversationId,
		items: readonly Readonly<Record<string, unknown>>[]
	): Promise<void>;
	pop(actor: ActorContext, conversationId: ConversationId): Promise<AgentSessionItem | undefined>;
	clear(actor: ActorContext, conversationId: ConversationId): Promise<void>;
}

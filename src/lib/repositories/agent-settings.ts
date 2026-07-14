import type {
	ActorContext,
	AgentPreferences,
	AgentRun,
	AgentRunId,
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

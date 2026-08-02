import type { ActorContext } from '$lib/models/identity';
import type { AgentPreferences, AgentSessionItem, ConversationId } from '$lib/models/agent';

/** Per-user resolution floor. Absent means every setting falls back to the deployment's environment default, never a hard-coded literal. */
export interface AgentPreferencesRepository {
	get(actor: ActorContext): Promise<AgentPreferences | undefined>;
	upsert(actor: ActorContext, preferences: AgentPreferences): Promise<AgentPreferences>;
}

/** The provider's serialized session state for a run, persisted so an `awaiting_approval` run survives a restart and resumes from exactly where it stopped. */
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
	replace(
		conversationId: import('$lib/models/agent').ConversationId,
		items: readonly Readonly<Record<string, unknown>>[]
	): Promise<void>;
}

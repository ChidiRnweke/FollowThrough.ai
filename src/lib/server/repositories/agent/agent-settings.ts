import type { ActorContext } from '$lib/models/identity';
import type { CanvasSessionResult } from '$lib/models/diagrams';
import type {
	AgentPreferences,
	AgentSessionItem,
	ConversationId,
	PersistedSessionItem
} from '$lib/models/agent';

/** Per-user resolution floor. Absent means every setting falls back to the deployment's environment default, never a hard-coded literal. */
export interface AgentPreferencesRepository {
	get(actor: ActorContext): Promise<AgentPreferences | undefined>;
	/** Serialize both first creation and subsequent edits within the caller transaction. */
	getForWrite(actor: ActorContext): Promise<AgentPreferences | undefined>;
	upsert(actor: ActorContext, preferences: AgentPreferences): Promise<AgentPreferences>;
}

/** The provider's serialized session state for a run, persisted so an `awaiting_approval` run survives a restart and resumes from exactly where it stopped. */
export interface AgentSessionRepository {
	/** Ordered, actor-owned read projection. No transcript window. */
	listCanvasResults(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<readonly CanvasSessionResult[]>;
	list(
		actor: ActorContext,
		conversationId: ConversationId,
		limit?: number
	): Promise<readonly AgentSessionItem[]>;
	append(
		actor: ActorContext,
		conversationId: ConversationId,
		items: readonly PersistedSessionItem[]
	): Promise<void>;
	pop(actor: ActorContext, conversationId: ConversationId): Promise<AgentSessionItem | undefined>;
	clear(actor: ActorContext, conversationId: ConversationId): Promise<void>;
	replace(conversationId: ConversationId, items: readonly PersistedSessionItem[]): Promise<void>;
}

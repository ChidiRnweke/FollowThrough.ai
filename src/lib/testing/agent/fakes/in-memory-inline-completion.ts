import type { ActorContext } from '$lib/models/identity';
import type {
	AgentPreferences,
	InlineCompletionContext,
	InlineSuggestionRequest
} from '$lib/models/agent';
import type { AgentPreferencesRepository } from '$lib/server/repositories/agent';
import type { InlineCompletionGenerator } from '$lib/server/services/agent/runs/contracts';

export class InMemoryAgentPreferencesRepository implements AgentPreferencesRepository {
	readonly entries = new Map<string, AgentPreferences>();
	async get(actor: ActorContext): Promise<AgentPreferences | undefined> {
		return this.entries.get(actor.userId);
	}
	async upsert(actor: ActorContext, preferences: AgentPreferences): Promise<AgentPreferences> {
		this.entries.set(actor.userId, preferences);
		return preferences;
	}
}

export class InMemoryInlineCompletion implements InlineCompletionGenerator {
	readonly contexts: InlineCompletionContext[] = [];
	text = ' window.';
	failure?: Error;
	async complete(
		_request: InlineSuggestionRequest,
		context: InlineCompletionContext
	): Promise<string> {
		if (this.failure) throw this.failure;
		this.contexts.push(context);
		return this.text;
	}
}

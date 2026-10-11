import type { ActorContext } from '$lib/models/identity';
import type {
	AgentPreferences,
	InlineCompletionContext,
	InlineSuggestionRequest
} from '$lib/models/agent';
import type { InlineCompletionService } from '$lib/server/services/inline-suggestions/completion';
import type { AgentPreferencesRepository } from '$lib/server/repositories/agent';

export class InMemoryAgentPreferencesRepository implements AgentPreferencesRepository {
	constructor(private readonly actor: ActorContext) {}
	readonly entries = new Map<string, AgentPreferences>();
	snapshot(): () => void {
		const entries = structuredClone(this.entries);
		return () => {
			this.entries.clear();
			for (const [key, value] of entries) this.entries.set(key, value);
		};
	}
	async getForWrite(_resourceKey: string): Promise<AgentPreferences | undefined> {
		return this.get();
	}
	async get(): Promise<AgentPreferences | undefined> {
		return this.entries.get(this.actor.userId);
	}
	async upsert(preferences: AgentPreferences): Promise<AgentPreferences> {
		this.entries.set(this.actor.userId, preferences);
		return preferences;
	}
}

/** Inline completion that records each request and answers with configured ghost text. */
export class InMemoryInlineCompletion implements InlineCompletionService {
	readonly requests: {
		readonly request: InlineSuggestionRequest;
		readonly context: InlineCompletionContext;
		readonly model: string;
		readonly signal: AbortSignal;
	}[] = [];
	text = ' window.';
	failure?: Error;
	async complete(
		request: InlineSuggestionRequest,
		context: InlineCompletionContext,
		model: string,
		signal: AbortSignal
	): Promise<string> {
		this.requests.push({ request, context, model, signal });
		if (this.failure) throw this.failure;
		return this.text;
	}
}

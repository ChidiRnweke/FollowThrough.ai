import type { ActorContext } from '$lib/models/identity';
import type {
	AgentPreferences,
	InlineCompletionPrompt,
	InlineCompletionResult,
	InlineCompletionGenerator
} from '$lib/models/agent';
import type { AgentPreferencesRepository } from '$lib/server/repositories/agent';

export class InMemoryAgentPreferencesRepository implements AgentPreferencesRepository {
	readonly entries = new Map<string, AgentPreferences>();
	snapshot(): () => void {
		const entries = structuredClone(this.entries);
		return () => {
			this.entries.clear();
			for (const [key, value] of entries) this.entries.set(key, value);
		};
	}
	async getForWrite(
		actor: ActorContext,
		_resourceKey: string
	): Promise<AgentPreferences | undefined> {
		return this.get(actor);
	}
	async get(actor: ActorContext): Promise<AgentPreferences | undefined> {
		return this.entries.get(actor.userId);
	}
	async upsert(actor: ActorContext, preferences: AgentPreferences): Promise<AgentPreferences> {
		this.entries.set(actor.userId, preferences);
		return preferences;
	}
}

export class InMemoryInlineCompletion implements InlineCompletionGenerator {
	readonly requests: { prompt: InlineCompletionPrompt; signal: AbortSignal; model: string }[] = [];
	text = ' window.';
	failure?: Error;
	async complete(
		prompt: InlineCompletionPrompt,
		signal: AbortSignal,
		model: string
	): Promise<InlineCompletionResult> {
		this.requests.push({ prompt, signal, model });
		if (this.failure) throw this.failure;
		return { raw: this.text, attributes: {} };
	}
}

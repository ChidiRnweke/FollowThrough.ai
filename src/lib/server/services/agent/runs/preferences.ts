import { OpenRouter } from '@openrouter/sdk';
import type { ActorContext } from '$lib/models/identity';
import type {
	AgentExecutionMode,
	AgentModel,
	AgentPreferences,
	Conversation
} from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import { ValidationError } from '$lib/errors';
import type { AgentPreferencesRepository } from '$lib/server/repositories/agent';

const now = (): DateTime => new Date().toISOString() as DateTime;

export interface AgentPreferencesStore {
	get(actor: ActorContext): Promise<AgentPreferences>;
}

export interface AgentModelCatalog {
	list(): Promise<readonly AgentModel[]>;
}

export class AgentPreferenceCatalog implements AgentPreferencesStore {
	constructor(private readonly repository: AgentPreferencesRepository) {}

	defaults(actor: ActorContext, timestamp: DateTime): AgentPreferences {
		return {
			userId: actor.userId,
			executionMode: 'approval_required',
			inlineSuggestionsEnabled: true,
			createdAt: timestamp,
			updatedAt: timestamp
		};
	}
	async get(actor: ActorContext): Promise<AgentPreferences> {
		return (await this.repository.get(actor)) ?? this.defaults(actor, now());
	}
	getForWrite(actor: ActorContext): Promise<AgentPreferences | undefined> {
		return this.repository.getForWrite(actor);
	}
	persist(actor: ActorContext, preferences: AgentPreferences): Promise<AgentPreferences> {
		if (preferences.userId !== actor.userId)
			throw new ValidationError('The preferences belong to another account');
		return this.repository.upsert(actor, preferences);
	}
}

export class AgentModels implements AgentModelCatalog {
	private cached: readonly AgentModel[] | undefined;
	private refreshedAt = 0;

	constructor(
		private readonly client: OpenRouter,
		private readonly recommended: ReadonlySet<string>,
		private readonly ttlMs = 5 * 60 * 1000
	) {}

	async list(): Promise<readonly AgentModel[]> {
		if (this.cached && Date.now() - this.refreshedAt < this.ttlMs) return this.cached;
		try {
			const response = await this.client.models.list();
			this.cached = response.data
				.map((model): AgentModel => {
					const supportsTools = model.supportedParameters.includes('tools');
					const supportsVision = model.architecture?.inputModalities.includes('image') ?? false;
					const capabilities = [
						supportsTools ? 'tools' : undefined,
						model.supportedParameters.includes('structured_outputs')
							? 'structured output'
							: undefined,
						model.supportedParameters.includes('reasoning') ? 'reasoning' : undefined
					].filter((value): value is string => value !== undefined);
					return {
						id: model.id,
						name: model.name,
						provider: model.id.split('/')[0] ?? 'OpenRouter',
						...(model.contextLength ? { contextLength: model.contextLength } : {}),
						supportsTools,
						supportsVision,
						recommended: this.recommended.has(model.id),
						capabilities
					};
				})
				.sort(
					(a, b) => Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name)
				);
			this.refreshedAt = Date.now();
			return this.cached;
		} catch (error) {
			if (this.cached) return this.cached;
			throw error;
		}
	}
}

export function resolveAgentExecutionMode(
	conversation: Pick<Conversation, 'executionModeOverride'>,
	preferences: Pick<AgentPreferences, 'executionMode'>
): AgentExecutionMode {
	return conversation.executionModeOverride ?? preferences.executionMode;
}

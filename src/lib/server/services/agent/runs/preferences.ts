import type { AgentCatalogMetadata } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { AgentModel, AgentPreferences } from '$lib/models/agent';
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

export interface AgentPreferenceEditor extends AgentPreferencesStore {
	defaults(actor: ActorContext, timestamp: DateTime): AgentPreferences;
	getForWrite(actor: ActorContext): Promise<AgentPreferences | undefined>;
	persist(actor: ActorContext, preferences: AgentPreferences): Promise<AgentPreferences>;
}

export class AgentPreferenceCatalog implements AgentPreferencesStore, AgentPreferenceEditor {
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

export interface AgentModelReader {
	list(): Promise<{ readonly data: readonly AgentCatalogMetadata[] }>;
}

export class AgentModels implements AgentModelCatalog {
	constructor(
		private readonly client: AgentModelReader,
		private readonly recommended: ReadonlySet<string>
	) {}

	async list(): Promise<readonly AgentModel[]> {
		const response = await this.client.list();
		return response.data
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
	}
}

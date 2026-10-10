import type { AgentCatalogMetadata } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { AgentModel, AgentPreferences, ModelCatalogCache } from '$lib/models/agent';
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
	getForWrite(actor: ActorContext, resourceKey: string): Promise<AgentPreferences | undefined>;
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
	getForWrite(actor: ActorContext, resourceKey: string): Promise<AgentPreferences | undefined> {
		return this.repository.getForWrite(actor, resourceKey);
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

/**
 * The provider catalog, refreshed at most once per `ttlMs`. A failed refresh serves the last
 * successful catalog; with none retained, the provider failure propagates.
 */
export class AgentModels implements AgentModelCatalog {
	constructor(
		private readonly client: AgentModelReader,
		private readonly recommended: ReadonlySet<string>,
		private readonly cache: ModelCatalogCache,
		private readonly ttlMs = 5 * 60 * 1000,
		private readonly clock: () => number = Date.now
	) {}

	async list(): Promise<readonly AgentModel[]> {
		const cached = this.cache.current;
		if (cached && this.clock() - cached.refreshedAt < this.ttlMs) return cached.models;
		try {
			const models = await this.read();
			this.cache.replace({ models, refreshedAt: this.clock() });
			return models;
		} catch (error) {
			const retained = this.cache.current;
			if (retained) return retained.models;
			throw error;
		}
	}

	private async read(): Promise<readonly AgentModel[]> {
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

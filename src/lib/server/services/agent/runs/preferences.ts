import type { AgentCatalogMetadata } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { AgentModel, AgentPreferences } from '$lib/models/agent';
import { ExternalServiceError } from '$lib/errors';
import type { DateTime } from '$lib/models/workspace';
import { ValidationError } from '$lib/errors';
import type { AgentPreferencesRepository } from '$lib/server/repositories/agent';

export interface AgentPreferencesStore {
	get(): Promise<AgentPreferences>;
}

export interface AgentModelCatalog {
	list(): Promise<readonly AgentModel[]>;
}

export interface AgentPreferenceEditor extends AgentPreferencesStore {
	defaults(timestamp: DateTime): AgentPreferences;
	getForWrite(resourceKey: string): Promise<AgentPreferences | undefined>;
	persist(preferences: AgentPreferences): Promise<AgentPreferences>;
}

export class AgentPreferenceCatalog implements AgentPreferencesStore, AgentPreferenceEditor {
	constructor(
		private readonly actor: ActorContext,
		private readonly repository: AgentPreferencesRepository,
		private readonly now: () => DateTime
	) {}

	defaults(timestamp: DateTime): AgentPreferences {
		return {
			userId: this.actor.userId,
			executionMode: 'approval_required',
			inlineSuggestionsEnabled: true,
			createdAt: timestamp,
			updatedAt: timestamp
		};
	}
	async get(): Promise<AgentPreferences> {
		return (await this.repository.get()) ?? this.defaults(this.now());
	}
	getForWrite(resourceKey: string): Promise<AgentPreferences | undefined> {
		return this.repository.getForWrite(resourceKey);
	}
	persist(preferences: AgentPreferences): Promise<AgentPreferences> {
		if (preferences.userId !== this.actor.userId)
			throw new ValidationError('The preferences belong to another account');
		return this.repository.upsert(preferences);
	}
}

export interface AgentModelReader {
	list(): Promise<{ readonly data: readonly AgentCatalogMetadata[] }>;
}

/**
 * The provider catalog, read on every call. The browser keeps its copy in the workspace
 * bootstrap, so the server holds none.
 */
export class AgentModels implements AgentModelCatalog {
	constructor(
		private readonly client: AgentModelReader,
		private readonly recommended: ReadonlySet<string>
	) {}

	async list(): Promise<readonly AgentModel[]> {
		const response = await this.client.list().catch((cause) => {
			throw new ExternalServiceError('The model catalog could not be read.', {
				cause: cause instanceof Error ? cause.message : String(cause)
			});
		});
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

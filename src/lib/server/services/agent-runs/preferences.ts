import { OpenRouter } from '@openrouter/sdk';
import type {
	ActorContext,
	AgentExecutionMode,
	AgentModel,
	AgentPreferences,
	Conversation,
	DateTime,
	UpdateAgentPreferencesInput
} from '$lib/models';
import { ValidationError } from '$lib/errors';
import type { AgentPreferencesRepository } from '$lib/server/repositories';

const now = (): DateTime => new Date().toISOString() as DateTime;

export const normalizeLanguageModelId = (modelId: string): string => {
	const separator = modelId.indexOf(':');
	if (separator <= 0 || modelId.includes('/')) return modelId;
	return `${modelId.slice(0, separator)}/${modelId.slice(separator + 1)}`;
};

export interface AgentPreferencesStore {
	get(actor: ActorContext): Promise<AgentPreferences>;
	update(actor: ActorContext, input: UpdateAgentPreferencesInput): Promise<AgentPreferences>;
}

export interface AgentModelCatalog {
	list(): Promise<readonly AgentModel[]>;
	assertSelectable(modelId: string): Promise<void>;
	assertVisionSelectable?(modelId: string): Promise<void>;
}

export class AgentPreferenceCatalog implements AgentPreferencesStore {
	constructor(private readonly repository: AgentPreferencesRepository) {}

	async get(actor: ActorContext): Promise<AgentPreferences> {
		return (
			(await this.repository.get(actor)) ?? {
				userId: actor.userId,
				executionMode: 'approval_required',
				inlineSuggestionsEnabled: true,
				createdAt: now(),
				updatedAt: now()
			}
		);
	}

	async update(actor: ActorContext, input: UpdateAgentPreferencesInput): Promise<AgentPreferences> {
		const current = await this.get(actor);
		return this.repository.upsert(actor, {
			...current,
			...(input.defaultModel === null
				? { defaultModel: undefined }
				: input.defaultModel
					? { defaultModel: input.defaultModel }
					: {}),
			...(input.defaultVisionModel === null
				? { defaultVisionModel: undefined }
				: input.defaultVisionModel
					? { defaultVisionModel: input.defaultVisionModel }
					: {}),
			...(input.executionMode !== undefined ? { executionMode: input.executionMode } : {}),
			...(input.inlineSuggestionsEnabled !== undefined
				? { inlineSuggestionsEnabled: input.inlineSuggestionsEnabled }
				: {}),
			updatedAt: now()
		});
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

	async assertSelectable(modelId: string): Promise<void> {
		const model = (await this.list()).find((candidate) => candidate.id === modelId);
		if (!model || !model.supportsTools)
			throw new ValidationError('The selected model is unavailable or does not support tools');
	}

	async assertVisionSelectable(modelId: string): Promise<void> {
		const model = (await this.list()).find((candidate) => candidate.id === modelId);
		if (!model?.supportsVision)
			throw new ValidationError('The selected vision model is unavailable or cannot read images');
	}
}

export function resolveAgentModel(
	conversation: Pick<Conversation, 'modelOverride'>,
	preferences: Pick<AgentPreferences, 'defaultModel'>,
	environmentDefault: string
): string {
	return normalizeLanguageModelId(
		conversation.modelOverride ?? preferences.defaultModel ?? environmentDefault
	);
}

export function resolveVisionModel(
	conversation: Pick<Conversation, 'visionModelOverride'>,
	preferences: Pick<AgentPreferences, 'defaultVisionModel'>,
	environmentDefault: string
): string {
	return normalizeLanguageModelId(
		conversation.visionModelOverride ?? preferences.defaultVisionModel ?? environmentDefault
	);
}

export function resolveAgentExecutionMode(
	conversation: Pick<Conversation, 'executionModeOverride'>,
	preferences: Pick<AgentPreferences, 'executionMode'>
): AgentExecutionMode {
	return conversation.executionModeOverride ?? preferences.executionMode;
}

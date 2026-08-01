import { OpenRouter } from '@openrouter/sdk';
import type { ActorContext } from '$lib/models/identity';
import {
	normalizeLanguageModelId,
	resolveAttachmentVisionModel,
	type AgentExecutionMode,
	type AgentModel,
	type AgentPreferences,
	type Conversation,
	type UpdateAgentPreferencesInput
} from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import { ValidationError } from '$lib/errors';
import type { AgentPreferencesRepository } from '$lib/server/repositories/agent';
import type { WebResearchOptions } from '$lib/models/agent';

const now = (): DateTime => new Date().toISOString() as DateTime;

export { normalizeLanguageModelId, resolveAttachmentVisionModel };

export interface AgentPreferencesStore {
	get(actor: ActorContext): Promise<AgentPreferences>;
	update(actor: ActorContext, input: UpdateAgentPreferencesInput): Promise<AgentPreferences>;
}

export interface AgentModelCatalog {
	list(): Promise<readonly AgentModel[]>;
	/** Selectable as the chat model: must exist and support tool calling. */
	assertSelectable(modelId: string): Promise<void>;
	assertVisionSelectable?(modelId: string): Promise<void>;
	/**
	 * Selectable for a toolless call such as inline completion. Existence is the
	 * only requirement — demanding tool support here would rule out exactly the
	 * small, fast models this path wants.
	 */
	assertGenerationSelectable?(modelId: string): Promise<void>;
}

/**
 * One field of a partial edit. The three cases are distinct and all three are
 * used: `null` clears the setting back to the deployment default, a value sets
 * it, and `undefined` leaves whatever is stored alone — which is what lets the
 * agent change one setting without having to send the rest.
 */
const edit = <K extends string, V>(
	key: K,
	value: V | null | undefined
): Partial<Record<K, V | undefined>> => {
	if (value === undefined) return {};
	return { [key]: value === null ? undefined : value } as Record<K, V | undefined>;
};

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
			...edit('defaultModel', input.defaultModel),
			...edit('defaultVisionModel', input.defaultVisionModel),
			...edit('inlineModel', input.inlineModel),
			...edit('attachmentVisionModel', input.attachmentVisionModel),
			...edit('webSearchEngine', input.webSearchEngine),
			...edit('webSearchMaxResults', input.webSearchMaxResults),
			...edit('webSearchMaxTotalResults', input.webSearchMaxTotalResults),
			...edit('agentMaxTurns', input.agentMaxTurns),
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

	async assertGenerationSelectable(modelId: string): Promise<void> {
		const model = (await this.list()).find((candidate) => candidate.id === modelId);
		if (!model) throw new ValidationError('The selected model is unavailable');
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

export function resolveMaxTurns(
	preferences: Pick<AgentPreferences, 'agentMaxTurns'>,
	environmentDefault: number
): number {
	return preferences.agentMaxTurns ?? environmentDefault;
}

/**
 * Layered over the environment options rather than replacing them, so a user who
 * has set only a result cap still gets the deployment's engine.
 */
export function resolveWebSearchOptions(
	preferences: Pick<
		AgentPreferences,
		'webSearchEngine' | 'webSearchMaxResults' | 'webSearchMaxTotalResults'
	>,
	environmentDefaults: WebResearchOptions
): WebResearchOptions {
	return {
		...environmentDefaults,
		...(preferences.webSearchEngine ? { engine: preferences.webSearchEngine } : {}),
		...(preferences.webSearchMaxResults ? { maxResults: preferences.webSearchMaxResults } : {}),
		...(preferences.webSearchMaxTotalResults
			? { maxTotalResults: preferences.webSearchMaxTotalResults }
			: {})
	};
}

export function resolveAgentExecutionMode(
	conversation: Pick<Conversation, 'executionModeOverride'>,
	preferences: Pick<AgentPreferences, 'executionMode'>
): AgentExecutionMode {
	return conversation.executionModeOverride ?? preferences.executionMode;
}

import {
	normalizeLanguageModelId,
	type AgentModel,
	type AgentPreferences,
	type Conversation
} from '$lib/models/agent';

/** Resolve the account choice against the deployment default supplied by the caller. */
export function resolveDefaultAgentModel(
	preferences: Pick<AgentPreferences, 'defaultModel'>,
	environmentDefault: string
): string {
	return normalizeLanguageModelId(preferences.defaultModel ?? environmentDefault);
}

export function resolveDefaultVisionModel(
	preferences: Pick<AgentPreferences, 'defaultVisionModel'>,
	environmentDefault: string
): string {
	return normalizeLanguageModelId(preferences.defaultVisionModel ?? environmentDefault);
}

export function resolveAgentModel(
	conversation: Pick<Conversation, 'modelOverride'>,
	preferences: Pick<AgentPreferences, 'defaultModel'>,
	environmentDefault: string
): string {
	return conversation.modelOverride
		? normalizeLanguageModelId(conversation.modelOverride)
		: resolveDefaultAgentModel(preferences, environmentDefault);
}

export function resolveVisionModel(
	conversation: Pick<Conversation, 'visionModelOverride'>,
	preferences: Pick<AgentPreferences, 'defaultVisionModel'>,
	environmentDefault: string
): string {
	return conversation.visionModelOverride
		? normalizeLanguageModelId(conversation.visionModelOverride)
		: resolveDefaultVisionModel(preferences, environmentDefault);
}

export const resolveAttachmentVisionModel = (
	preferences: Pick<AgentPreferences, 'attachmentVisionModel'>,
	environmentDefault: string
): string => normalizeLanguageModelId(preferences.attachmentVisionModel ?? environmentDefault);

const includeConfiguredModel = (
	models: AgentModel[],
	id: string,
	supportsTools: boolean,
	supportsVision: boolean
): void => {
	if (models.some((model) => model.id === id)) return;
	models.push({
		id,
		name: id,
		provider: id.split('/')[0],
		supportsTools,
		supportsVision,
		recommended: false,
		capabilities: ['configured']
	});
};

/** The bootstrap always includes its deployment chat model, even outside the provider catalog. */
export function configuredChatModels(
	models: readonly AgentModel[],
	defaults: { chatModelId: string; visionModelId: string }
): readonly AgentModel[] {
	const result = [...models];
	includeConfiguredModel(
		result,
		defaults.chatModelId,
		true,
		defaults.chatModelId === defaults.visionModelId
	);
	return result;
}

/** Preserve explicitly configured models when the deployment catalog omits them. */
export const configuredAgentModels = (
	models: readonly AgentModel[],
	defaults: { chatModelId: string; visionModelId: string }
): readonly AgentModel[] => {
	const result = [...models];
	for (const id of new Set([defaults.chatModelId, defaults.visionModelId])) {
		includeConfiguredModel(result, id, id === defaults.chatModelId, id === defaults.visionModelId);
	}
	return result;
};

/** Validate a requested role against the resolved catalog, including trusted deployment choices. */
export function modelChoiceIssue(
	models: readonly AgentModel[],
	modelId: string,
	role: 'chat' | 'vision' | 'generation'
): string | null {
	const model = models.find((candidate) => candidate.id === modelId);
	if (role === 'chat' && (!model || !model.supportsTools))
		return 'The selected model is unavailable or does not support tools';
	if (role === 'vision' && (!model || !model.supportsVision))
		return 'The selected vision model is unavailable or cannot read images';
	if (!model) return 'The selected model is unavailable';
	return null;
}

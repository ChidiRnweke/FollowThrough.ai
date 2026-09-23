import type { AgentPreferences, UpdateAgentPreferencesInput } from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';

const preferenceEdit = <K extends string, V>(
	key: K,
	value: V | null | undefined
): Partial<Record<K, V | undefined>> => {
	if (value === undefined) return {};
	const result: Partial<Record<K, V | undefined>> = {};
	result[key] = value === null ? undefined : value;
	return result;
};

/** Apply omitted, cleared, and explicit preferences identically on the device and server. */
export const applyAgentPreferenceUpdate = (
	current: AgentPreferences,
	input: UpdateAgentPreferencesInput,
	timestamp: DateTime
): AgentPreferences => ({
	...current,
	updatedAt: timestamp,
	...preferenceEdit('defaultModel', input.defaultModel),
	...preferenceEdit('defaultVisionModel', input.defaultVisionModel),
	...preferenceEdit('inlineModel', input.inlineModel),
	...preferenceEdit('attachmentVisionModel', input.attachmentVisionModel),
	...preferenceEdit('webSearchEngine', input.webSearchEngine),
	...preferenceEdit('webSearchMaxResults', input.webSearchMaxResults),
	...preferenceEdit('webSearchMaxTotalResults', input.webSearchMaxTotalResults),
	...preferenceEdit('agentMaxTurns', input.agentMaxTurns),
	...(input.executionMode !== undefined ? { executionMode: input.executionMode } : {}),
	...(input.inlineSuggestionsEnabled !== undefined
		? { inlineSuggestionsEnabled: input.inlineSuggestionsEnabled }
		: {})
});

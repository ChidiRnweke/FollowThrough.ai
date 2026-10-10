import { ValidationError } from '$lib/errors';
import { webSearchEngines } from '$lib/models/agent';
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
const applyAgentPreferenceUpdate = (
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

/**
 * Rejected rather than clamped: a caller that asks for 500 search results has
 * misunderstood the setting, and silently storing 50 would tell them they got
 * what they asked for.
 */
const assertRange = (
	label: string,
	value: number | null | undefined,
	minimum: number,
	maximum: number
): void => {
	if (value === undefined || value === null) return;
	if (!Number.isInteger(value) || value < minimum || value > maximum)
		throw new ValidationError(`${label} must be a whole number between ${minimum} and ${maximum}`);
};

const validateAgentPreferenceUpdate = (input: UpdateAgentPreferencesInput): void => {
	if (input.webSearchEngine && !webSearchEngines.includes(input.webSearchEngine))
		throw new ValidationError(`Web search engine must be one of: ${webSearchEngines.join(', ')}`);
	assertRange('Web search results', input.webSearchMaxResults, 1, 50);
	assertRange('Total web search results', input.webSearchMaxTotalResults, 1, 100);
	assertRange('Agent turn limit', input.agentMaxTurns, 1, 50);
};

export interface AgentPreferenceEditing {
	validate(input: UpdateAgentPreferencesInput): void;
	apply(
		current: AgentPreferences,
		input: UpdateAgentPreferencesInput,
		timestamp: DateTime
	): AgentPreferences;
}
export class AgentPreferenceEditingService implements AgentPreferenceEditing {
	validate(input: UpdateAgentPreferencesInput): void {
		validateAgentPreferenceUpdate(input);
	}
	apply(
		current: AgentPreferences,
		input: UpdateAgentPreferencesInput,
		timestamp: DateTime
	): AgentPreferences {
		return applyAgentPreferenceUpdate(current, input, timestamp);
	}
}

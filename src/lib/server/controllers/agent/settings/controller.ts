import type { ActorContext } from '$lib/models/identity';
import type { AgentModel, AgentPreferences, UpdateAgentPreferencesInput } from '$lib/models/agent';
import { webSearchEngines } from '$lib/models/agent';
import { ValidationError } from '$lib/errors';
import type {
	AgentModelCatalog,
	AgentPreferencesStore
} from '$lib/server/services/agent/runs/preferences';

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

/**
 * Application boundary for agent preferences: reading and updating the user's defaults,
 * and listing the models they can choose from.
 */
export interface AgentSettingsController {
	/** Read the user's current agent preferences. */
	getPreferences(actor: ActorContext): Promise<AgentPreferences>;
	/**
	 * Apply an update to the user's agent preferences, validating every value in one
	 * place — the settings form and the agent's own `update_agent_preferences` tool both
	 * land here, so the limits have to hold exactly once. Model choices are checked
	 * selectable, the web search engine must be known, and numeric limits are rejected
	 * rather than clamped.
	 *
	 * @throws ValidationError if a model is not selectable, the engine is unknown, or a
	 * numeric limit falls outside its range.
	 */
	updatePreferences(
		actor: ActorContext,
		input: UpdateAgentPreferencesInput
	): Promise<AgentPreferences>;
	/** List the models the user can choose from for the agent. */
	listModels(actor: ActorContext): Promise<readonly AgentModel[]>;
}

export interface AgentSettingsDependencies {
	preferences: AgentPreferencesStore;
	models: AgentModelCatalog;
}

export class AgentSettings implements AgentSettingsController {
	constructor(private readonly dependencies: AgentSettingsDependencies) {}

	getPreferences(actor: ActorContext): Promise<AgentPreferences> {
		return this.dependencies.preferences.get(actor);
	}

	async updatePreferences(
		actor: ActorContext,
		input: UpdateAgentPreferencesInput
	): Promise<AgentPreferences> {
		if (input.defaultModel) await this.dependencies.models.assertSelectable(input.defaultModel);
		if (input.defaultVisionModel)
			await this.dependencies.models.assertVisionSelectable?.(input.defaultVisionModel);
		if (input.attachmentVisionModel)
			await this.dependencies.models.assertVisionSelectable?.(input.attachmentVisionModel);
		// Inline completion never calls tools, so it is checked for existence only.
		if (input.inlineModel)
			await this.dependencies.models.assertGenerationSelectable?.(input.inlineModel);
		// Both the settings form and the agent's own `update_agent_preferences`
		// land here, so this is the one place the limits have to hold.
		if (input.webSearchEngine && !webSearchEngines.includes(input.webSearchEngine))
			throw new ValidationError(`Web search engine must be one of: ${webSearchEngines.join(', ')}`);
		assertRange('Web search results', input.webSearchMaxResults, 1, 50);
		assertRange('Total web search results', input.webSearchMaxTotalResults, 1, 100);
		assertRange('Agent turn limit', input.agentMaxTurns, 1, 50);
		return this.dependencies.preferences.update(actor, input);
	}

	listModels(_actor: ActorContext): Promise<readonly AgentModel[]> {
		void _actor;
		return this.dependencies.models.list();
	}
}

import type {
	ActorContext,
	AgentModel,
	AgentPreferences,
	UpdateAgentPreferencesInput
} from '$lib/models';
import type { AgentModelCatalog, AgentPreferencesStore } from '$lib/server/services';

export interface AgentSettingsController {
	getPreferences(actor: ActorContext): Promise<AgentPreferences>;
	updatePreferences(
		actor: ActorContext,
		input: UpdateAgentPreferencesInput
	): Promise<AgentPreferences>;
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
		return this.dependencies.preferences.update(actor, input);
	}

	listModels(_actor: ActorContext): Promise<readonly AgentModel[]> {
		void _actor;
		return this.dependencies.models.list();
	}
}

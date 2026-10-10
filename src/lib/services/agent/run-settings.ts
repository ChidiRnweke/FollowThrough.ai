import type {
	AgentExecutionMode,
	AgentPreferences,
	Conversation,
	WebResearchOptions,
	WebResearchSettings
} from '$lib/models/agent';

export interface AgentRunSettings {
	executionMode(
		conversation: Pick<Conversation, 'executionModeOverride'>,
		preferences: Pick<AgentPreferences, 'executionMode'>
	): AgentExecutionMode;
	research(options: WebResearchOptions, defaults: WebResearchSettings): WebResearchSettings;
}

export class AgentRunSettingsService implements AgentRunSettings {
	executionMode(
		conversation: Pick<Conversation, 'executionModeOverride'>,
		preferences: Pick<AgentPreferences, 'executionMode'>
	): AgentExecutionMode {
		return conversation.executionModeOverride ?? preferences.executionMode;
	}
	research(options: WebResearchOptions, defaults: WebResearchSettings): WebResearchSettings {
		return {
			engine: options.engine ?? defaults.engine,
			maxResults: options.maxResults ?? defaults.maxResults,
			maxTotalResults: options.maxTotalResults ?? defaults.maxTotalResults
		};
	}
}

import {
	AgentModelSelectionService,
	AgentModelChoiceService
} from '$lib/services/agent/model-selection';
import { AgentRunSettingsService } from '$lib/services/agent/run-settings';
export const agentModelRulesFixture = () => ({
	runSettings: new AgentRunSettingsService(),
	modelSelection: new AgentModelSelectionService(),
	modelChoices: new AgentModelChoiceService()
});

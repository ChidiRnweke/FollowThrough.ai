import { AgentImagePreparationService } from '$lib/server/services/agent/runs/images';
import {
	AgentModelSelectionService,
	AgentModelChoiceService
} from '$lib/services/agent/model-selection';
import { AgentRunSettingsService } from '$lib/services/agent/run-settings';
export const agentModelRulesFixture = () => ({
	imagePreparation: new AgentImagePreparationService(),
	runSettings: new AgentRunSettingsService(),
	modelSelection: new AgentModelSelectionService(),
	modelChoices: new AgentModelChoiceService()
});

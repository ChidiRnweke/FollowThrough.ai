import { AgentRunStatusService } from '$lib/services/agent/run-status';
import { AgentStreamPresentationService } from '$lib/server/services/agent/runs/stream-presentation';
import { AgentImagePreparationService } from '$lib/server/services/agent/runs/images';
import {
	AgentModelSelectionService,
	AgentModelChoiceService
} from '$lib/services/agent/model-selection';
import { AgentRunSettingsService } from '$lib/services/agent/run-settings';
export const agentRulesFixture = () => ({
	runStatus: new AgentRunStatusService(),
	streamPresentation: new AgentStreamPresentationService(),
	imagePreparation: new AgentImagePreparationService(),
	runSettings: new AgentRunSettingsService(),
	modelSelection: new AgentModelSelectionService(),
	modelChoices: new AgentModelChoiceService()
});

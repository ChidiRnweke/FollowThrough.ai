import {
	AgentModelSelectionService,
	AgentModelChoiceService
} from '$lib/services/agent/model-selection';
export const agentModelRulesFixture = () => ({
	modelSelection: new AgentModelSelectionService(),
	modelChoices: new AgentModelChoiceService()
});

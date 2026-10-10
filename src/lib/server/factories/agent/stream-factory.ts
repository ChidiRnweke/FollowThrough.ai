import {
	AgentToolEvents,
	AgentReasoningEvents,
	type AgentStreamMappings
} from '$lib/server/controllers/agent/stream-events';
import { AgentStreamStore } from '$lib/server/stores/agent/stream';
import { AgentStreamBoundary } from '$lib/server/adapters/agent/stream-reader';
import { AgentStreamPresentationService } from '$lib/server/services/agent/runs/stream-presentation';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
export const createAgentStream = (): AgentStreamMappings => {
	const state = new AgentStreamStore();
	const presentation = new AgentStreamPresentationService();
	return {
		tools: new AgentToolEvents(state, new AgentStreamBoundary(readToolFailure), presentation),
		reasoning: new AgentReasoningEvents(state, presentation)
	};
};

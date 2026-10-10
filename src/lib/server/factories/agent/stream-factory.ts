import type { AgentStreamState } from '$lib/server/stores/agent/stream';
import type { AgentStreamReader } from '$lib/server/controllers/agent/execution';
import type { AgentStreamPresentation } from '$lib/server/services/agent/runs/stream-presentation';
import { AgentStreamStore } from '$lib/server/stores/agent/stream';
import { AgentStreamBoundary } from '$lib/server/adapters/agent/stream-reader';
import { AgentStreamPresentationService } from '$lib/server/services/agent/runs/stream-presentation';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
export const createAgentStream = (): {
	state: AgentStreamState;
	reader: AgentStreamReader;
	presentation: AgentStreamPresentation;
} => ({
	state: new AgentStreamStore(),
	reader: new AgentStreamBoundary(readToolFailure),
	presentation: new AgentStreamPresentationService()
});

import { tracedService } from '$lib/server/infrastructure/telemetry/service-boundary';
import type { TokenCounter } from '$lib/models/tokenization';
import { AgentContext, type IAgentContext } from '$lib/server/services/agent/runs/context';

export const createAgentContext = (tokens: TokenCounter): IAgentContext => {
	const configured = Number(process.env.CONTEXT_NOTE_TOKEN_LIMIT ?? '4000');
	return tracedService(
		'AgentContext',
		new AgentContext(tokens, Number.isInteger(configured) && configured > 0 ? configured : 4000)
	);
};

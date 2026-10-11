import type { AgentTool } from '$lib/models/agent-tool-protocol';
import type { AgentHarnessDependencies } from '$lib/server/controllers/agent/controller';
import { createAgentToolset } from '$lib/server/factories/agent/tools/toolset';
import type { ConversationHistory } from '$lib/server/services/agent/conversations/history';
import type { AgentTurns } from '$lib/server/services/agent/runs/turns';
import { AgentPromptService } from '$lib/server/services/agent/runs/instructions';
import { AgentStreamPresentationService } from '$lib/server/services/agent/runs/stream-presentation';
import { AgentToolRecoveryService } from '$lib/server/services/agent/runs/tool-recovery';
import { AgentToolApprovalRules } from '$lib/services/agent/tool-approval';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';

/** The harness's turn dependencies around a provider fake, with no tools unless a test adds them. */
export const harnessTurnDependencies = (
	turns: AgentTurns,
	conversationHistory: ConversationHistory,
	tools: readonly AgentTool[] = []
): Pick<
	AgentHarnessDependencies,
	| 'turns'
	| 'prompts'
	| 'toolRecovery'
	| 'agentAvailable'
	| 'tools'
	| 'mcpTools'
	| 'toolset'
	| 'toolPreferences'
	| 'toolCatalog'
	| 'toolApproval'
	| 'toolSearch'
	| 'streamPresentation'
	| 'conversationHistory'
	| 'observeTurn'
> => ({
	turns,
	prompts: new AgentPromptService(),
	toolRecovery: new AgentToolRecoveryService(),
	agentAvailable: true,
	tools: () => tools,
	mcpTools: () => tools,
	toolset: createAgentToolset,
	toolPreferences: { view: async () => [] },
	toolCatalog: new AgentToolCatalogService(),
	toolApproval: new AgentToolApprovalRules(),
	toolSearch: new InMemoryToolRetriever(),
	streamPresentation: new AgentStreamPresentationService(),
	conversationHistory,
	observeTurn: async function* (_context, operation) {
		yield* operation();
	}
});

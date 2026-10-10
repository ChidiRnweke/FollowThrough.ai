import { InMemoryTurnObserver } from '$lib/testing/telemetry/fakes/in-memory-turn-observer';
import type {
	AgentRunId,
	ConversationId,
	AgentEvent,
	AgentRunContext,
	PreparedAgentRun,
	ProviderStreamEvent
} from '$lib/models/agent';
import { CHAT_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import { AgentExecution } from '$lib/server/controllers/agent/execution';
import { createAgentStream } from '$lib/server/factories/agent/stream-factory';
import { AgentPromptService } from '$lib/server/services/agent/runs/instructions';
import { AgentToolRecoveryService } from '$lib/server/services/agent/runs/tool-recovery';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryExecutionInfrastructure } from '$lib/testing/agent/fakes/in-memory-execution';
const timestamp = '2026-01-01T00:00:00.000Z' as DateTime;
const resolvedContext: AgentRunContext = {
	contextNotes: [],
	contextResources: [],
	skills: { items: [] }
};
const run: PreparedAgentRun = {
	kind: 'agent',
	id: '00000000-0000-4000-8000-000000000098' as AgentRunId,
	userId: testActor().userId,
	conversationId: '00000000-0000-4000-8000-000000000099' as ConversationId,
	model: 'local/test',
	executionMode: 'approval_required',
	status: 'running',
	requestId: 'request-provider-test',
	pendingDecisions: [],
	contextSnapshot: resolvedContext,
	inputSnapshot: {
		conversationId: '00000000-0000-4000-8000-000000000099' as ConversationId,
		prompt: 'Help'
	},
	createdAt: timestamp,
	updatedAt: timestamp
};

export const streamExecutionFixture = (events: readonly ProviderStreamEvent[]) => {
	const infrastructure = new InMemoryExecutionInfrastructure(events);
	const execution = new AgentExecution(
		new AgentPromptService(),
		new AgentToolRecoveryService(),
		createAgentStream,
		async () => ({
			agentTools: () => [],
			offeredToolNames: () => [],
			reviewDecision: (pending) => pending,
			catalog: () => []
		}),
		{
			create: () => ({
				getSessionId: async () => run.conversationId,
				getItems: async () => [],
				addItems: async () => {},
				popItem: async () => undefined,
				clearSession: async () => {},
				snapshot: async () => []
			})
		},
		true,
		infrastructure,
		new InMemoryTurnObserver()
	);
	const collect = async (): Promise<AgentEvent[]> => {
		const result: AgentEvent[] = [];
		for await (const update of execution.execute({
			actor: testActor(),
			run,
			request: run.inputSnapshot,
			imageInput: { kind: 'none' },
			webSearch: CHAT_WEB_SEARCH_DEFAULTS,
			context: resolvedContext,
			signal: new AbortController().signal,
			toolExecutor: { completed: async () => {} }
		})) {
			if (update.type === 'event') result.push(update.event);
		}
		return result;
	};
	return { collect, infrastructure };
};

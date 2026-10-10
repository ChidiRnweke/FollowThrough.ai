import type {
	AgentRunId,
	AgentRunSnapshot,
	AgentRunStatus,
	ConversationId
} from '$lib/models/agent';
import {
	runAgentInputBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
export const chatRunSnapshot = (
	id: AgentRunId,
	conversationId: ConversationId,
	status: AgentRunStatus
): AgentRunSnapshot => ({
	run: {
		kind: 'agent',
		id,
		userId: testActor().userId,
		conversationId,
		model: 'test/model',
		executionMode: 'approval_required',
		status,
		requestId: 'chat-test-request',
		inputSnapshot: runAgentInputBuilder({ conversationId }),
		pendingDecisions: [],
		createdAt: testNow,
		updatedAt: testNow
	},
	pendingDecisions: [],
	latestCursor: '0'
});

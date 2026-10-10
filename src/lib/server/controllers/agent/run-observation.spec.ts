import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId, WorkflowAgentRun } from '$lib/models/agent';
import { AgentEventStore } from '$lib/server/stores/agent/events';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { Agent, type AgentDependencies } from './controller';

const runId = '31000000-0000-4000-8000-000000000001' as AgentRunId;

const setup = () => {
	const runs = new InMemoryAgentRunPersistence();
	const run: WorkflowAgentRun = {
		kind: 'workflow',
		id: runId,
		conversationId: '31000000-0000-4000-8000-000000000002' as ConversationId,
		userId: testActor().userId,
		status: 'running',
		model: 'openai/test-model',
		executionMode: 'auto_accept',
		requestId: 'observation-test',
		pendingDecisions: [],
		contextSnapshot: { kind: 'note_action', action: 'diagram', noteId: testNoteId() },
		createdAt: testNow,
		updatedAt: testNow
	};
	runs.runs.push(run);
	const events = new AgentEventStore();
	const agent = new Agent(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentDependencies>({
			...agentRulesFixture(),
			runs,
			runObservers: events
		})
	);
	return { agent, events };
};

describe('run observation', () => {
	it('signals the owner until the subscription ends', async () => {
		const { agent, events } = setup();
		const signals: string[] = [];
		const unsubscribe = await agent.observeRun(testActor(), runId, () => signals.push('changed'));
		events.notify(runId);
		unsubscribe();
		events.notify(runId);
		expect(signals).toEqual(['changed']);
	});

	it('does not let another actor observe a run', async () => {
		const { agent } = setup();
		await expect(agent.observeRun(testActor(2), runId, () => {})).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

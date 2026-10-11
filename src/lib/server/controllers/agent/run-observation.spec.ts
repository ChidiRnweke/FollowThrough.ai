import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId, WorkflowAgentRun } from '$lib/models/agent';
import { RunSignalService } from '$lib/server/services/agent/runs/signals';
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
	const agent = new Agent(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentDependencies>({
			...agentRulesFixture(),
			runs,
			runSignals: new RunSignalService(runs, runs)
		})
	);
	return { agent, runs };
};

describe('run observation', () => {
	it('signals the owner on each committed change until the subscription ends', async () => {
		const { agent, runs } = setup();
		const signals: string[] = [];
		const unsubscribe = await agent.observeRun(testActor(), runId, () => signals.push('changed'));
		await runs.append(runId, 1, { type: 'run_started', runId, attempt: 1 });
		await Promise.resolve();
		await unsubscribe();
		await runs.append(runId, 1, { type: 'run_started', runId, attempt: 1 });
		await Promise.resolve();
		expect(signals).toEqual(['changed']);
	});

	it('does not let another actor observe a run', async () => {
		const { agent } = setup();
		await expect(agent.observeRun(testActor(2), runId, () => {})).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

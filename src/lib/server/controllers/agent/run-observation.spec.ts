import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { AgentRunHarnessRecords } from '$lib/server/services/agent/runs/records';
import type { ActorContext } from '$lib/models/identity';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId, WorkflowAgentRun } from '$lib/models/agent';
import { RunSignalService } from '$lib/server/services/agent/runs/signals';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentSdkHarness, type AgentHarnessDependencies } from './controller';

const runId = '31000000-0000-4000-8000-000000000001' as AgentRunId;

/** The run belongs to `testActor()`; `viewer` is the account the controller acts for. */
const setup = (viewer: ActorContext = testActor()) => {
	const runs = new InMemoryAgentRunPersistence(viewer);
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
	const agent = new AgentSdkHarness(
		viewer,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentHarnessDependencies>({
			now: testClock,
			...agentRulesFixture(),
			records: new AgentRunHarnessRecords(runs, runs, runs, new InMemoryAgentSessionRepository()),
			runSignals: new RunSignalService(runs, runs)
		})
	);
	return { agent, runs };
};

describe('run observation', () => {
	it('signals the owner on each committed change until the subscription ends', async () => {
		const { agent, runs } = setup();
		const signals: string[] = [];
		const unsubscribe = await agent.observeRun(runId, () => signals.push('changed'));
		await runs.append(runId, 1, { type: 'run_started', runId, attempt: 1 });
		await Promise.resolve();
		await unsubscribe();
		await runs.append(runId, 1, { type: 'run_started', runId, attempt: 1 });
		await Promise.resolve();
		expect(signals).toEqual(['changed']);
	});

	it('does not let another actor observe a run', async () => {
		const { agent } = setup(testActor(2));
		await expect(agent.observeRun(runId, () => {})).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

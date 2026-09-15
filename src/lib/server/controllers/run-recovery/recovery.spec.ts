import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId, WorkflowAgentRun } from '$lib/models/agent';
import type { AgentRunExecutor } from '$lib/server/services/agent/runs/execution-contracts';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunRecovery } from './controller';

const recover = async (status: 'running' | 'cancelling') => {
	const runs = new InMemoryAgentRunPersistence();
	const run: WorkflowAgentRun = {
		kind: 'workflow',
		id: '30000000-0000-4000-8000-000000000001' as AgentRunId,
		conversationId: '30000000-0000-4000-8000-000000000002' as ConversationId,
		userId: testActor().userId,
		status,
		model: 'openai/test-model',
		executionMode: 'auto_accept',
		requestId: 'recovery-test',
		pendingDecisions: [],
		contextSnapshot: { kind: 'note_action', action: 'diagram', noteId: testNoteId() },
		createdAt: testNow,
		updatedAt: testNow
	};
	runs.runs.push(run);
	const settlements = new RunSettlements(runs, runs, new InMemoryTransactionRunner([runs]));
	await new RunRecovery(runs, capabilityDependencies<AgentRunExecutor>({}), settlements, {
		notify: () => {}
	}).recover();
	return { status: runs.runs[0].status, events: runs.events.map((record) => record.event.type) };
};
describe('run recovery after restart', () => {
	it('finishes an interrupted cancellation with its cancelled event', async () => {
		expect(await recover('cancelling')).toEqual({ status: 'cancelled', events: ['cancelled'] });
	});
	it('records a failed event for interrupted execution', async () => {
		expect(await recover('running')).toEqual({ status: 'failed', events: ['failed'] });
	});
});

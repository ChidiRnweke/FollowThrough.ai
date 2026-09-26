import { describe, expect, it, vi } from 'vitest';
import { agentContextFixture } from '$lib/testing/agent/fixtures/context';
import type { AgentRunId, ConversationId, WorkflowAgentRun } from '$lib/models/agent';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { Agent, type AgentDependencies } from './controller';

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
	const settlements = new RunSettlements(runs, runs);
	await new Agent(
		capabilityDependencies<AgentDependencies>({
			runs,
			settlements,
			eventBus: { notify: () => {} },
			transactionRunner: new InMemoryTransactionRunner([runs])
		})
	).recoverInterruptedRuns();
	return { status: runs.runs[0].status, events: runs.events.map((record) => record.event.type) };
};
describe('run recovery after restart', () => {
	it('executes a committed chat request that had not started before shutdown', async () => {
		const state = agentContextFixture();
		const actor = testActor();
		const conversationId = crypto.randomUUID() as ConversationId;
		const runId = crypto.randomUUID() as AgentRunId;
		await state.conversations.insert(actor, {
			id: conversationId,
			userId: actor.userId,
			kind: 'chat',
			createdAt: testNow,
			updatedAt: testNow
		});
		await state.runs.insert(actor, {
			kind: 'agent',
			id: runId,
			userId: actor.userId,
			conversationId,
			model: 'test/model',
			executionMode: 'approval_required',
			status: 'queued',
			requestId: crypto.randomUUID(),
			pendingDecisions: [],
			inputSnapshot: { conversationId, prompt: 'Resume this request' },
			createdAt: testNow,
			updatedAt: testNow
		});
		await state.dependencies.conversationJournal.recordUserPrompt(
			actor,
			conversationId,
			'Resume this request',
			runId
		);
		await state.runs.append(runId, 1, {
			type: 'run_queued',
			runId,
			attempt: 1,
			reason: 'submitted'
		});
		await state.controller.recoverInterruptedRuns();
		await vi.waitFor(() =>
			expect(state.runs.runs.find((run) => run.id === runId)?.status).toBe('completed')
		);
	});
	it('finishes an interrupted cancellation with its cancelled event', async () => {
		expect(await recover('cancelling')).toEqual({ status: 'cancelled', events: ['cancelled'] });
	});
	it('records a failed event for interrupted execution', async () => {
		expect(await recover('running')).toEqual({ status: 'failed', events: ['failed'] });
	});
});

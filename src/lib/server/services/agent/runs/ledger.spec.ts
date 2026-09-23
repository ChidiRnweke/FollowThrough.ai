import { expect, it } from 'vitest';
import type { AgentRunStatus } from '$lib/models/agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import {
	testActor,
	testConversationId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentRunLedger } from './ledger';

it('starts a direct workflow with its actor and one creation timestamp', () => {
	const ledger = new AgentRunLedger(new InMemoryAgentRunPersistence());
	const run = ledger.prepareCreation(
		testActor(),
		{
			conversationId: testConversationId(),
			model: 'test/model',
			executionMode: 'auto_accept',
			contextSnapshot: { kind: 'diagram', state: 'unprepared', operation: 'convert' }
		},
		testNow
	);
	expect({
		userId: run.userId,
		status: run.status,
		createdAt: run.createdAt,
		startedAt: run.startedAt,
		updatedAt: run.updatedAt
	}).toEqual({
		userId: testActor().userId,
		status: 'running',
		createdAt: testNow,
		startedAt: testNow,
		updatedAt: testNow
	});
});

it('resolves completion with a finish time and cleared approval state', () => {
	const ledger = new AgentRunLedger(new InMemoryAgentRunPersistence());
	expect(ledger.prepareCompletion('running', testNow)).toEqual({
		status: 'completed',
		finishedAt: testNow,
		updatedAt: testNow,
		pendingDecisions: [],
		serializedState: null
	});
});

it('resolves failure with the original message and finish time', () => {
	const ledger = new AgentRunLedger(new InMemoryAgentRunPersistence());
	expect(ledger.prepareFailure('running', 'Provider disconnected', testNow)).toEqual({
		status: 'failed',
		failure: 'Provider disconnected',
		finishedAt: testNow,
		updatedAt: testNow,
		pendingDecisions: []
	});
});

it.each<AgentRunStatus>([
	'queued',
	'awaiting_approval',
	'cancelling',
	'completed',
	'failed',
	'cancelled'
])('refuses publication after the run becomes %s', (status) => {
	const ledger = new AgentRunLedger(new InMemoryAgentRunPersistence());
	expect(() => ledger.prepareCompletion(status, testNow)).toThrow('no longer running');
});

it.each<AgentRunStatus>([
	'queued',
	'awaiting_approval',
	'cancelling',
	'completed',
	'failed',
	'cancelled'
])('does not replace %s with a late provider failure', (status) => {
	const ledger = new AgentRunLedger(new InMemoryAgentRunPersistence());
	expect(ledger.prepareFailure(status, 'Late provider failure', testNow)).toBeNull();
});

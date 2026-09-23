import { expect, it } from 'vitest';
import type { AgentRunStatus, PendingAgentDecision } from '$lib/models/agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunApprovals } from './approvals';

const pendingDecisions: readonly PendingAgentDecision[] = [
	{ callId: 'call-a', toolName: 'archive_note', arguments: {} }
];

it('requeues a reviewed checkpoint at the decision timestamp', () => {
	const approvals = new RunApprovals(new InMemoryAgentRunPersistence());
	expect(
		approvals.plan({ status: 'awaiting_approval', pendingDecisions }, ['call-a'], testNow)
	).toEqual({ status: 'queued', updatedAt: testNow });
});

it('keeps the first queue transition when another pending call is decided', () => {
	const approvals = new RunApprovals(new InMemoryAgentRunPersistence());
	expect(approvals.plan({ status: 'queued', pendingDecisions }, ['call-a'], testNow)).toBeNull();
});

it('rejects an entire batch if a call is absent from the checkpoint', () => {
	const approvals = new RunApprovals(new InMemoryAgentRunPersistence());
	expect(() =>
		approvals.plan({ status: 'awaiting_approval', pendingDecisions }, ['call-a', 'call-b'], testNow)
	).toThrow('The pending tool call was not found');
});

it.each<AgentRunStatus>(['running', 'cancelling', 'completed', 'failed', 'cancelled'])(
	'rejects decisions after the run becomes %s',
	(status) => {
		const approvals = new RunApprovals(new InMemoryAgentRunPersistence());
		expect(() => approvals.plan({ status, pendingDecisions }, ['call-a'], testNow)).toThrow(
			'The agent run is not awaiting approval'
		);
	}
);

import { expect, it } from 'vitest';
import type { AgentRunStatus } from '$lib/models/agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunCancellation } from './cancellation';

it('finishes queued cancellation at the request timestamp', () => {
	const cancellation = new RunCancellation(new InMemoryAgentRunPersistence());
	expect(cancellation.plan('queued', testNow)).toEqual({
		status: 'cancelled',
		cancelRequestedAt: testNow,
		finishedAt: testNow,
		updatedAt: testNow
	});
});

it.each<AgentRunStatus>(['running', 'awaiting_approval'])(
	'leaves %s completion to settlement',
	(status) => {
		const cancellation = new RunCancellation(new InMemoryAgentRunPersistence());
		expect(cancellation.plan(status, testNow)).toEqual({
			status: 'cancelling',
			cancelRequestedAt: testNow,
			updatedAt: testNow
		});
	}
);

it.each<AgentRunStatus>(['cancelling', 'cancelled', 'completed', 'failed'])(
	'does not rewrite %s on another cancellation request',
	(status) => {
		const cancellation = new RunCancellation(new InMemoryAgentRunPersistence());
		expect(cancellation.plan(status, testNow)).toBeNull();
	}
);

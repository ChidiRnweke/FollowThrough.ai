import { expect, it } from 'vitest';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunCheckpoints } from './checkpoints';

const checkpoints = new RunCheckpoints(new InMemoryAgentRunPersistence());
const checkpoint = { serializedState: 'provider-state', pendingDecisions: [] };

it('uses the provider trace when a resumed execution supplies it', () => {
	expect(
		checkpoints.prepare(
			{ traceparent: 'previous-trace' },
			{ ...checkpoint, traceparent: 'provider-trace' },
			testNow
		).traceparent
	).toBe('provider-trace');
});

it('keeps the saved trace when the provider omits it', () => {
	expect(checkpoints.prepare({ traceparent: 'saved-trace' }, checkpoint, testNow).traceparent).toBe(
		'saved-trace'
	);
});

it('represents an absent trace explicitly for persistence', () => {
	expect(checkpoints.prepare({}, checkpoint, testNow).traceparent).toBeNull();
});

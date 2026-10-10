import { expect, it, vi } from 'vitest';
import { agentSubmissionFixture } from '$lib/testing/agent/fixtures/submission';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentRunStatusService } from '$lib/services/agent/run-status';
const runStatus = new AgentRunStatusService();

it('still aborts the resumed provider after separate decisions reach the queued run', async () => {
	const fixture = agentSubmissionFixture('approval');
	fixture.runner.outcome = {
		type: 'approval_checkpoint',
		serializedState: 'provider-checkpoint',
		sessionItems: [],
		pendingDecisions: [
			{ callId: 'call-a', toolName: 'create_todo', arguments: {} },
			{ callId: 'call-b', toolName: 'archive_note', arguments: {} }
		]
	};
	const receipt = await fixture.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Review these changes'
	});
	const completion = Promise.withResolvers<void>();
	try {
		await vi.waitFor(() => {
			if (fixture.runs.runs[0]?.status !== 'awaiting_approval')
				throw new Error('Approval is not parked');
		});
		fixture.pauseExecution();
		fixture.runner.completion = completion.promise;
		fixture.runner.abortable = true;
		fixture.runner.outcome = { type: 'completed', sessionItems: [] };
		await fixture.controller.decide(testActor(), {
			runId: receipt.runId,
			callId: 'call-a',
			decision: 'approve'
		});
		await fixture.controller.decide(testActor(), {
			runId: receipt.runId,
			callId: 'call-b',
			decision: 'reject'
		});
		fixture.release();
		await vi.waitFor(() => {
			if (fixture.runner.signals.length !== 2) throw new Error('Provider has not resumed');
		});
		await fixture.controller.cancel(testActor(), receipt.runId);
		expect(fixture.runner.signals.at(-1)?.aborted).toBe(true);
	} finally {
		completion.resolve();
		fixture.release();
		await fixture.controller.cancel(testActor(), receipt.runId);
		await vi.waitFor(() => {
			if (fixture.runs.runs.some((run) => !runStatus.isTerminal(run.status)))
				throw new Error('Run has not settled');
		});
	}
});

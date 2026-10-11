import { describe, expect, it } from 'vitest';
import type { AgentRun, AgentRunId, ConversationId } from '$lib/models/agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunSignalService } from './signals';

const runId = '32000000-0000-4000-8000-000000000001' as AgentRunId;

const setup = (status: AgentRun['status']) => {
	const runs = new InMemoryAgentRunPersistence(testActor());
	runs.runs.push({
		kind: 'workflow',
		id: runId,
		conversationId: '32000000-0000-4000-8000-000000000002' as ConversationId,
		userId: testActor().userId,
		status,
		model: 'openai/test-model',
		executionMode: 'auto_accept',
		requestId: 'signals-test',
		pendingDecisions: [],
		contextSnapshot: { kind: 'note_action', action: 'diagram', noteId: testNoteId() },
		createdAt: testNow,
		updatedAt: testNow
	});
	return { runs, signals: new RunSignalService(runs, runs) };
};

const cancel = (runs: InMemoryAgentRunPersistence) =>
	runs.updateCancellation(runId, {
		status: 'cancelling',
		cancelRequestedAt: testNow,
		updatedAt: testNow
	});

describe('run cancellation signals', () => {
	it('aborts a watched execution when its run is asked to cancel', async () => {
		const { runs, signals } = setup('running');
		const execution = new AbortController();
		await signals.abortOnCancel(runId, execution);
		const before = execution.signal.aborted;
		await cancel(runs);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect({ before, after: execution.signal.aborted }).toEqual({ before: false, after: true });
	});

	it('aborts at once when the cancellation committed before watching began', async () => {
		const { runs, signals } = setup('running');
		await cancel(runs);
		const execution = new AbortController();
		await signals.abortOnCancel(runId, execution);
		expect(execution.signal.aborted).toBe(true);
	});

	it('leaves the execution running after watching stops', async () => {
		const { runs, signals } = setup('running');
		const execution = new AbortController();
		const stop = await signals.abortOnCancel(runId, execution);
		await stop();
		await cancel(runs);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(execution.signal.aborted).toBe(false);
	});
});

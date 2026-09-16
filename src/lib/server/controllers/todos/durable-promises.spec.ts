import { expect, it, vi } from 'vitest';
import type { SelectionGeneration } from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import {
	promiseExtractionFixture,
	promiseSelection
} from '$lib/testing/todos/fixtures/promise-extraction';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const prepare = async (
	generation: SelectionGeneration = { kind: 'model', model: 'test/model' }
) => {
	const state = promiseExtractionFixture();
	state.extractor.candidates = [
		{ action: 'Send it', responsibility: 'mine', strength: 'explicit', confidence: 95 }
	];
	const receipt = await state.transactions.run(() =>
		state.requests.prepare(testActor(), {
			requestId: crypto.randomUUID(),
			context: { kind: 'promise_extraction', selection: promiseSelection, generation }
		})
	);
	return { ...state, receipt };
};

it('executes from the persisted selection and generation settings', async () => {
	const state = await prepare();
	state.extractor.modelCandidates.set('test/model', [
		{ action: 'Frozen model result', responsibility: 'mine', strength: 'explicit', confidence: 95 }
	]);
	state.dependencies.promiseGeneration = { kind: 'model', model: 'different/model' };
	await state.controller.executePromiseRun(testActor(), state.receipt.runId);
	expect(
		state.suggestions.suggestions.map((suggestion) =>
			suggestion.kind === 'todo' ? suggestion.payload.title : suggestion.kind
		)
	).toEqual(['Frozen model result']);
});

it('keeps deterministic extraction for a queued request when model configuration changes', async () => {
	const state = await prepare({ kind: 'rules' });
	await state.controller.executePromiseRun(testActor(), state.receipt.runId);
	expect(
		state.suggestions.suggestions.map((suggestion) =>
			suggestion.kind === 'todo' ? suggestion.payload.title : suggestion.kind
		)
	).toEqual(['Send it soon']);
});

it('resolves tomorrow against the stored request date after queued recovery', async () => {
	const state = promiseExtractionFixture();
	const text = 'I will send it tomorrow.';
	state.content.notes[0] = { ...state.content.notes[0], plainText: text };
	const receipt = await state.transactions.run(() =>
		state.requests.prepare(testActor(), {
			requestId: crypto.randomUUID(),
			context: {
				kind: 'promise_extraction',
				generation: { kind: 'rules' },
				selection: { ...promiseSelection, to: text.length, text }
			}
		})
	);
	const submittedAt = '2026-09-01T10:00:00.000Z' as DateTime;
	state.runs.runs[0] = { ...state.runs.runs[0], createdAt: submittedAt, updatedAt: submittedAt };
	await state.controller.executePromiseRun(testActor(), receipt.runId);
	expect(
		state.suggestions.suggestions.map((suggestion) =>
			suggestion.kind === 'todo' ? suggestion.payload.dueDate : undefined
		)
	).toEqual(['2026-09-02']);
});

it('resumes a queued request without its original in-memory callback', async () => {
	const state = await prepare();
	await state.controller.recoverQueuedPromiseRuns();
	await vi.waitFor(() => {
		if (state.runs.runs[0]?.status !== 'completed') throw new Error('Run has not completed');
	});
	expect(state.runs.events.map((record) => record.event.type)).toEqual([
		'run_queued',
		'run_started',
		'workflow_result',
		'completed'
	]);
});

it('saves no proposals when cancellation wins while extraction is in flight', async () => {
	const state = await prepare();
	state.trust.autoAccept = true;
	const gate = Promise.withResolvers<void>();
	state.extractor.completion = gate.promise;
	const execution = state.controller.executePromiseRun(testActor(), state.receipt.runId);
	await state.extractor.started.promise;
	await state.agent.cancel(testActor(), state.receipt.runId);
	gate.resolve();
	await execution;
	expect({
		status: state.runs.runs[0].status,
		suggestions: state.suggestions.suggestions,
		todos: state.todos.todos,
		anchors: state.content.anchors
	}).toEqual({ status: 'cancelled', suggestions: [], todos: [], anchors: [] });
});

it('rejects an edited selection before saving extracted proposals', async () => {
	const state = await prepare();
	const gate = Promise.withResolvers<void>();
	state.extractor.completion = gate.promise;
	const execution = state.controller.executePromiseRun(testActor(), state.receipt.runId);
	await state.extractor.started.promise;
	state.content.notes[0] = { ...state.content.notes[0], currentRevision: 2 };
	gate.resolve();
	await execution;
	expect({ status: state.runs.runs[0].status, suggestions: state.suggestions.suggestions }).toEqual(
		{ status: 'failed', suggestions: [] }
	);
});

it('rolls back proposals and accepted todos when the result event fails', async () => {
	const state = await prepare();
	state.trust.autoAccept = true;
	state.runs.failedEvent = 'workflow_result';
	await state.controller.executePromiseRun(testActor(), state.receipt.runId);
	expect({
		failure: state.runs.runs[0].failure,
		status: state.runs.runs[0].status,
		suggestions: state.suggestions.suggestions,
		todos: state.todos.todos,
		events: state.runs.events.map((record) => record.event.type)
	}).toEqual({
		failure: 'Event storage unavailable',
		status: 'failed',
		suggestions: [],
		todos: [],
		events: ['run_queued', 'run_started', 'failed']
	});
});

it('leaves a completed request unchanged when another execution arrives', async () => {
	const state = await prepare();
	await state.controller.executePromiseRun(testActor(), state.receipt.runId);
	await state.controller.executePromiseRun(testActor(), state.receipt.runId);
	expect(
		state.runs.events.filter((record) => record.event.type === 'workflow_result')
	).toHaveLength(1);
});

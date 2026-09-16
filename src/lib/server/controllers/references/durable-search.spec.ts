import { expect, it, vi } from 'vitest';
import type { Url } from '$lib/models/references';
import {
	referenceSearchFixture,
	referenceSelection
} from '$lib/testing/references/fixtures/search';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const candidate = {
	url: 'https://www.rfc-editor.org/rfc/rfc6749' as Url,
	title: 'OAuth standard',
	tier: 'standard' as const,
	relevanceNote: 'Defines OAuth',
	confidence: 95
};

const prepare = async () => {
	const state = referenceSearchFixture();
	state.references.candidates = [candidate];
	const receipt = await state.transactions.run(() =>
		state.requests.prepare(testActor(), {
			requestId: crypto.randomUUID(),
			context: { kind: 'reference_search', model: 'test/model', selection: referenceSelection }
		})
	);
	return { ...state, receipt };
};

it('uses the stored model after deployment settings change', async () => {
	const state = await prepare();
	state.references.modelCandidates.set('test/model', [
		{ ...candidate, title: 'Frozen model source' }
	]);
	state.dependencies.referenceModel = 'different/model';
	await state.reference.executeReferenceRun(testActor(), state.receipt.runId);
	expect(
		state.suggestions.suggestions.map((suggestion) =>
			suggestion.kind === 'reference' ? suggestion.payload.title : suggestion.kind
		)
	).toEqual(['Frozen model source']);
});

it('recovers a queued search from its saved selection', async () => {
	const state = await prepare();
	await state.reference.recoverQueuedReferenceRuns();
	await vi.waitFor(() => {
		if (state.runs.runs[0].status !== 'completed') throw new Error('Search has not settled');
	});
	expect(state.runs.events.map((record) => record.event.type)).toEqual([
		'run_queued',
		'run_started',
		'workflow_result',
		'completed'
	]);
});

it('saves no anchor or proposals when cancellation wins during web search', async () => {
	const state = await prepare();
	const gate = Promise.withResolvers<void>();
	state.references.completion = gate.promise;
	const execution = state.reference.executeReferenceRun(testActor(), state.receipt.runId);
	await state.references.started.promise;
	await state.agent.cancel(testActor(), state.receipt.runId);
	gate.resolve();
	await execution;
	expect({
		status: state.runs.runs[0].status,
		anchors: state.content.anchors,
		suggestions: state.suggestions.suggestions
	}).toEqual({ status: 'cancelled', anchors: [], suggestions: [] });
});

it('rejects a source revision changed during web search', async () => {
	const state = await prepare();
	const gate = Promise.withResolvers<void>();
	state.references.completion = gate.promise;
	const execution = state.reference.executeReferenceRun(testActor(), state.receipt.runId);
	await state.references.started.promise;
	state.content.notes[0] = { ...state.content.notes[0], currentRevision: 2 };
	gate.resolve();
	await execution;
	expect({ status: state.runs.runs[0].status, suggestions: state.suggestions.suggestions }).toEqual(
		{ status: 'failed', suggestions: [] }
	);
});

it('rolls back reference proposals and their anchor when the result event fails', async () => {
	const state = await prepare();
	state.runs.failedEvent = 'workflow_result';
	await state.reference.executeReferenceRun(testActor(), state.receipt.runId);
	expect({
		status: state.runs.runs[0].status,
		anchors: state.content.anchors,
		suggestions: state.suggestions.suggestions,
		events: state.runs.events.map((record) => record.event.type)
	}).toEqual({
		status: 'failed',
		anchors: [],
		suggestions: [],
		events: ['run_queued', 'run_started', 'failed']
	});
});

it('returns the same completed search for a repeated request ID', async () => {
	const state = referenceSearchFixture();
	state.references.candidates = [candidate];
	const request = { requestId: crypto.randomUUID(), selection: referenceSelection };
	const first = await state.reference.startSuggestFromSelection(testActor(), request);
	await vi.waitFor(() => {
		if (state.runs.runs[0].status !== 'completed') throw new Error('Search has not settled');
	});
	const second = await state.reference.startSuggestFromSelection(testActor(), request);
	expect({
		sameRun: first.runId === second.runId,
		suggestions: state.suggestions.suggestions.length,
		conversations: state.conversations.conversations.length
	}).toEqual({ sameRun: true, suggestions: 1, conversations: 1 });
});

it('settles a completed search only once when execution is delivered again', async () => {
	const state = await prepare();
	await state.reference.executeReferenceRun(testActor(), state.receipt.runId);
	await state.reference.executeReferenceRun(testActor(), state.receipt.runId);
	expect(
		state.runs.events.filter((record) => record.event.type === 'workflow_result')
	).toHaveLength(1);
});

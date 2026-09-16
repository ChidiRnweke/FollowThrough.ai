import { expect, it, vi } from 'vitest';
import type { SelectionGeneration } from '$lib/models/agent';
import {
	relatedNoteFixture,
	relatedSelection
} from '$lib/testing/relationships/fixtures/discovery';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const prepare = async (
	generation: SelectionGeneration = { kind: 'model', model: 'test/model' }
) => {
	const state = relatedNoteFixture();
	await state.repository.replaceForNote(testActor(), testNoteId(2), [
		searchDocumentBuilder({ content: 'The team chose OAuth.' })
	]);
	const receipt = await state.transactions.run(() =>
		state.requests.prepare(testActor(), {
			requestId: crypto.randomUUID(),
			context: { kind: 'related_notes', generation, selection: relatedSelection }
		})
	);
	return { ...state, receipt };
};

it('uses the stored classification model after deployment settings change', async () => {
	const state = await prepare();
	state.client.modelResults.set('test/model', {
		kind: 'elaborates',
		justification: 'Frozen model classification',
		confidence: 90
	});
	state.dependencies.relationshipGeneration = { kind: 'rules' };
	await state.controller.executeRelatedNoteRun(testActor(), state.receipt.runId);
	expect(
		state.suggestions.suggestions.map((suggestion) =>
			suggestion.kind === 'backlink' ? suggestion.payload.justification : suggestion.kind
		)
	).toEqual(['Frozen model classification']);
});

it('keeps rules for a queued request after a model becomes configured', async () => {
	const state = await prepare({ kind: 'rules' });
	state.client.failure = new Error('This request does not use a model');
	await state.controller.executeRelatedNoteRun(testActor(), state.receipt.runId);
	expect(
		state.suggestions.suggestions.map((suggestion) =>
			suggestion.kind === 'backlink' ? suggestion.payload.kind : suggestion.kind
		)
	).toEqual(['prior_decision']);
});

it('resumes a queued discovery from its persisted selection', async () => {
	const state = await prepare();
	await state.controller.recoverQueuedRelatedNoteRuns();
	await vi.waitFor(() => {
		if (state.runs.runs[0].status !== 'completed') throw new Error('Discovery has not settled');
	});
	expect(state.runs.events.map((record) => record.event.type)).toEqual([
		'run_queued',
		'run_started',
		'workflow_result',
		'completed'
	]);
});

it('saves no anchor or backlink proposals when cancellation wins during classification', async () => {
	const state = await prepare();
	const gate = Promise.withResolvers<void>();
	state.client.completion = gate.promise;
	const execution = state.controller.executeRelatedNoteRun(testActor(), state.receipt.runId);
	await state.client.started.promise;
	await state.agent.cancel(testActor(), state.receipt.runId);
	gate.resolve();
	await execution;
	expect({
		status: state.runs.runs[0].status,
		anchors: state.content.anchors,
		suggestions: state.suggestions.suggestions
	}).toEqual({ status: 'cancelled', anchors: [], suggestions: [] });
});

it('rejects a source revision edited during classification', async () => {
	const state = await prepare();
	const gate = Promise.withResolvers<void>();
	state.client.completion = gate.promise;
	const execution = state.controller.executeRelatedNoteRun(testActor(), state.receipt.runId);
	await state.client.started.promise;
	state.content.notes[0] = { ...state.content.notes[0], currentRevision: 2 };
	gate.resolve();
	await execution;
	expect({ status: state.runs.runs[0].status, suggestions: state.suggestions.suggestions }).toEqual(
		{ status: 'failed', suggestions: [] }
	);
});

it('rolls back backlink proposals and anchors when the result event fails', async () => {
	const state = await prepare();
	state.runs.failedEvent = 'workflow_result';
	await state.controller.executeRelatedNoteRun(testActor(), state.receipt.runId);
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

it('returns the same completed discovery when a request is delivered again', async () => {
	const state = relatedNoteFixture();
	await state.repository.replaceForNote(testActor(), testNoteId(2), [searchDocumentBuilder()]);
	const request = { requestId: crypto.randomUUID(), selection: relatedSelection };
	const first = await state.controller.startSuggestFromSelection(testActor(), request);
	await vi.waitFor(() => {
		if (state.runs.runs[0].status !== 'completed') throw new Error('Discovery has not settled');
	});
	const second = await state.controller.startSuggestFromSelection(testActor(), request);
	expect({
		sameRun: first.runId === second.runId,
		suggestions: state.suggestions.suggestions.length,
		conversations: state.conversations.conversations.length
	}).toEqual({ sameRun: true, suggestions: 1, conversations: 1 });
});

it('does not publish the result again after completion', async () => {
	const state = await prepare();
	await state.controller.executeRelatedNoteRun(testActor(), state.receipt.runId);
	await state.controller.executeRelatedNoteRun(testActor(), state.receipt.runId);
	expect(
		state.runs.events.filter((record) => record.event.type === 'workflow_result')
	).toHaveLength(1);
});

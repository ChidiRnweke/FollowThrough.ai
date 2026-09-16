import { expect, it, vi } from 'vitest';
import { Diagrams } from './controller';
import {
	diagramSelection,
	durableDiagramFixture
} from '$lib/testing/diagrams/fixtures/durable-generation';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const prepare = async () => {
	const state = durableDiagramFixture();
	const receipt = await state.transactions.run(() =>
		state.requests.prepare(testActor(), {
			requestId: crypto.randomUUID(),
			context: {
				kind: 'diagram_action',
				model: 'test/frozen',
				input: { operation: 'generate', selection: diagramSelection }
			}
		})
	);
	return { ...state, receipt };
};

it('records the provider failure on the diagram run without publishing a result', async () => {
	const state = await prepare();
	state.provider.failure = new Error('Diagram provider disconnected');
	await state.controller.executeDiagramRun(testActor(), state.receipt.runId);
	expect(
		state.persistence.events.map((record) =>
			record.event.type === 'failed'
				? { type: record.event.type, message: record.event.message }
				: { type: record.event.type }
		)
	).toEqual([
		{ type: 'run_queued' },
		{ type: 'run_started' },
		{ type: 'failed', message: 'Diagram provider disconnected' }
	]);
});

it('uses the saved model to produce the diagram after configuration changes', async () => {
	const state = await prepare();
	state.provider.mermaidByModel.set('test/frozen', 'flowchart LR\nFrozen --> Model');
	await state.controller.executeDiagramRun(testActor(), state.receipt.runId);
	const suggestion = state.suggestions.suggestions[0];
	expect(suggestion?.kind === 'diagram' ? suggestion.payload.source : undefined).toBe(
		'flowchart LR\nFrozen --> Model'
	);
});

it('recovers a queued diagram with one conversation, one run and its result event', async () => {
	const state = await prepare();
	await new Diagrams(state.dependencies).recoverQueuedDiagramRuns();
	await vi.waitFor(() => {
		if (state.persistence.runs[0].status !== 'completed')
			throw new Error('Diagram has not settled');
	});
	expect({
		runs: state.persistence.runs.map((run) => run.status),
		conversations: state.conversations.conversations.length,
		events: state.persistence.events.map((record) => record.event.type)
	}).toEqual({
		runs: ['completed'],
		conversations: 1,
		events: ['run_queued', 'run_started', 'workflow_result', 'completed']
	});
});

it('saves no diagram proposal or anchor when cancellation wins during generation', async () => {
	const state = await prepare();
	const gate = Promise.withResolvers<void>();
	state.provider.completion = gate.promise;
	const execution = state.controller.executeDiagramRun(testActor(), state.receipt.runId);
	try {
		await state.provider.started.promise;
		await state.agent.cancel(testActor(), state.receipt.runId);
	} finally {
		gate.resolve();
	}
	await execution;
	expect({
		status: state.persistence.runs[0].status,
		suggestions: state.suggestions.suggestions,
		anchors: state.notes.anchors
	}).toEqual({ status: 'cancelled', suggestions: [], anchors: [] });
});

it('rejects a changed source selection before publishing the generated diagram', async () => {
	const state = await prepare();
	const gate = Promise.withResolvers<void>();
	state.provider.completion = gate.promise;
	const execution = state.controller.executeDiagramRun(testActor(), state.receipt.runId);
	try {
		await state.provider.started.promise;
		state.notes.notes[0] = { ...state.notes.notes[0], currentRevision: 2 };
	} finally {
		gate.resolve();
	}
	await execution;
	expect({
		status: state.persistence.runs[0].status,
		suggestions: state.suggestions.suggestions
	}).toEqual({ status: 'failed', suggestions: [] });
});

it('rolls back the diagram and completion when its result event cannot be saved', async () => {
	const state = await prepare();
	state.persistence.failedEvent = 'workflow_result';
	await state.controller.executeDiagramRun(testActor(), state.receipt.runId);
	expect({
		status: state.persistence.runs[0].status,
		suggestions: state.suggestions.suggestions,
		anchors: state.notes.anchors,
		events: state.persistence.events.map((record) => record.event.type)
	}).toEqual({
		status: 'failed',
		suggestions: [],
		anchors: [],
		events: ['run_queued', 'run_started', 'failed']
	});
});

it('returns the completed diagram receipt when the same input is submitted again', async () => {
	const state = durableDiagramFixture();
	const request = { requestId: crypto.randomUUID(), selection: diagramSelection };
	const first = await state.controller.startGenerateMermaid(testActor(), request);
	await vi.waitFor(() => {
		if (state.persistence.runs[0].status !== 'completed')
			throw new Error('Diagram has not settled');
	});
	state.models.failure = new Error('Model catalog is offline');
	const second = await state.controller.startGenerateMermaid(testActor(), request);
	expect({
		sameRun: first.runId === second.runId,
		runs: state.persistence.runs.length,
		suggestions: state.suggestions.suggestions.length
	}).toEqual({ sameRun: true, runs: 1, suggestions: 1 });
});

it('publishes the revised inline Mermaid source on the same run', async () => {
	const state = durableDiagramFixture();
	const receipt = await state.controller.startReviseInlineMermaid(testActor(), {
		requestId: crypto.randomUUID(),
		noteId: testNoteId(),
		source: 'flowchart LR\nA --> B',
		instruction: 'Add a queue'
	});
	await vi.waitFor(() => {
		if (state.persistence.runs[0].status !== 'completed')
			throw new Error('Diagram has not settled');
	});
	expect(
		state.persistence.events
			.filter((record) => record.event.type === 'workflow_result')
			.map((record) => ({ runId: record.runId, event: record.event }))
	).toEqual([
		{
			runId: receipt.runId,
			event: {
				type: 'workflow_result',
				action: 'revise',
				result: { source: state.provider.mermaidSource }
			}
		}
	]);
});

it('does not regenerate a completed diagram when execution is delivered twice', async () => {
	const state = await prepare();
	await state.controller.executeDiagramRun(testActor(), state.receipt.runId);
	await state.controller.executeDiagramRun(testActor(), state.receipt.runId);
	expect(
		state.persistence.events.filter((record) => record.event.type === 'workflow_result')
	).toHaveLength(1);
});

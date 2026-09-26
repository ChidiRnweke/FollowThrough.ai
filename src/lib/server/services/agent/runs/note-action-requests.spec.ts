import { expect, it } from 'vitest';
import {
	promiseExtractionFixture,
	promiseSelection
} from '$lib/testing/todos/fixtures/promise-extraction';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const input = () => ({
	requestId: crypto.randomUUID(),
	context: {
		kind: 'promise_extraction' as const,
		generation: { kind: 'rules' as const },
		selection: promiseSelection
	}
});

it('stores one conversation and run for repeated delivery of the same request', async () => {
	const state = promiseExtractionFixture();
	const request = input();
	const first = await state.transactions.run(() => state.requests.prepare(testActor(), request));
	const second = await state.transactions.run(() =>
		state.requests.prepare(testActor(), {
			...request,
			context: { ...request.context, generation: { kind: 'model', model: 'new/model' } }
		})
	);
	expect({
		sameRun: first.runId === second.runId,
		runs: state.runs.runs.length,
		conversations: state.conversations.conversations.length
	}).toEqual({ sameRun: true, runs: 1, conversations: 1 });
});

it('rejects reuse of a request ID for a different selection', async () => {
	const state = promiseExtractionFixture();
	const request = input();
	await state.transactions.run(() => state.requests.prepare(testActor(), request));
	await expect(
		state.transactions.run(() =>
			state.requests.prepare(testActor(), {
				...request,
				context: { ...request.context, selection: { ...promiseSelection, revision: 2 } }
			})
		)
	).rejects.toThrow('different operation');
});

it('rejects reuse of a promise request ID for reference search on the same selection', async () => {
	const state = promiseExtractionFixture();
	const request = input();
	await state.transactions.run(() => state.requests.prepare(testActor(), request));
	await expect(
		state.transactions.run(() =>
			state.requests.prepare(testActor(), {
				requestId: request.requestId,
				context: {
					kind: 'reference_search',
					model: 'test/model',
					selection: request.context.selection
				}
			})
		)
	).rejects.toThrow('different operation');
});

it('rolls back the initial conversation and run when its queued event cannot be stored', async () => {
	const state = promiseExtractionFixture();
	state.runs.failedEvent = 'run_queued';
	await state.transactions
		.run(() => state.requests.prepare(testActor(), input()))
		.catch((error) => ({ kind: 'failure', error }));
	expect({
		runs: state.runs.runs,
		conversations: state.conversations.conversations,
		events: state.runs.events
	}).toEqual({ runs: [], conversations: [], events: [] });
});

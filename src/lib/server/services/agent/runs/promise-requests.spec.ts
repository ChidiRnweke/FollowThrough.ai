import { expect, it } from 'vitest';
import {
	promiseExtractionFixture,
	promiseSelection
} from '$lib/testing/todos/fixtures/promise-extraction';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const input = () => ({ requestId: crypto.randomUUID(), selection: promiseSelection });

it('stores one conversation and run for repeated delivery of the same request', async () => {
	const state = promiseExtractionFixture();
	const request = input();
	const first = await state.transactions.run(() =>
		state.requests.prepare(testActor(), request, { kind: 'rules' })
	);
	const second = await state.transactions.run(() =>
		state.requests.prepare(testActor(), request, { kind: 'model', model: 'new/model' })
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
	await state.transactions.run(() =>
		state.requests.prepare(testActor(), request, { kind: 'rules' })
	);
	await expect(
		state.transactions.run(() =>
			state.requests.prepare(
				testActor(),
				{ ...request, selection: { ...promiseSelection, revision: 2 } },
				{ kind: 'rules' }
			)
		)
	).rejects.toThrow('different operation');
});

it('rolls back the initial conversation and run when its queued event cannot be stored', async () => {
	const state = promiseExtractionFixture();
	state.runs.failedEvent = 'run_queued';
	await state.transactions
		.run(() => state.requests.prepare(testActor(), input(), { kind: 'rules' }))
		.catch((error) => ({ kind: 'failure', error }));
	expect({
		runs: state.runs.runs,
		conversations: state.conversations.conversations,
		events: state.runs.events
	}).toEqual({ runs: [], conversations: [], events: [] });
});

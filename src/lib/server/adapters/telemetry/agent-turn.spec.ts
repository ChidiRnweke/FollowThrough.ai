import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { APIUserAbortError } from 'openai';
import { createTelemetryCapability } from '$lib/server/factories/telemetry';

const exporter = new InMemorySpanExporter();
const sdk = new NodeSDK({
	autoDetectResources: false,
	spanProcessors: [new SimpleSpanProcessor(exporter)],
	logRecordProcessors: [],
	instrumentations: []
});
const telemetry = createTelemetryCapability();
const params = {
	input: 'hello',
	sessionId: 'conversation',
	model: 'fixture-model',
	userId: 'fixture-user',
	runId: 'fixture-run'
};
beforeAll(() => sdk.start());
beforeEach(() => exporter.reset());
afterAll(async () => {
	await sdk.shutdown();
	trace.disable();
	context.disable();
});

it('keeps each iterator step under the turn and rejoins the saved turn on resume', async () => {
	let saved: string | undefined;
	const values: string[] = [];
	await telemetry.operations.run('agent.submit', { kind: null }, async () => {
		const parentTraceparent = telemetry.traceContext.activeTraceparent();
		for await (const value of telemetry.turns.run(
			{
				...params,
				parentTraceparent,
				onRoot: (value) => {
					saved = value;
				}
			},
			async function* () {
				await telemetry.operations.run('first.step', {}, async () => 'first');
				yield 'first';
				await Promise.resolve();
				await telemetry.operations.run('second.step', {}, async () => 'second');
				yield 'second';
			},
			() => 'parked'
		))
			values.push(value);
	});
	if (!saved) throw new Error('Turn traceparent was not captured');
	for await (const value of telemetry.turns.run(
		{ ...params, parentTraceparent: saved },
		async function* () {
			yield 'resumed';
		},
		() => 'done'
	))
		values.push(value);
	const spans = exporter.getFinishedSpans();
	const submit = spans.find((span) => span.name === 'agent.submit');
	const turns = spans.filter((span) => span.name === 'agent.turn');
	if (!submit || turns.length !== 2) throw new Error('Expected submission and two turns');
	expect({
		values,
		names: spans.map((span) => span.name),
		sameTrace: spans.every((span) => span.spanContext().traceId === submit.spanContext().traceId),
		firstParent: turns[0].parentSpanContext?.spanId,
		resumeParent: turns[1].parentSpanContext?.spanId,
		stepParents: spans
			.filter((span) => span.name.endsWith('.step'))
			.map((span) => span.parentSpanContext?.spanId),
		sessions: turns.map((span) => span.attributes['session.id']),
		saved
	}).toEqual({
		values: ['first', 'second', 'resumed'],
		names: ['first.step', 'second.step', 'agent.turn', 'agent.submit', 'agent.turn'],
		sameTrace: true,
		firstParent: submit.spanContext().spanId,
		resumeParent: turns[0].spanContext().spanId,
		stepParents: [turns[0].spanContext().spanId, turns[0].spanContext().spanId],
		sessions: ['conversation', 'conversation'],
		saved: `00-${turns[0].spanContext().traceId}-${turns[0].spanContext().spanId}-01`
	});
});

it.each([
	new DOMException('cancelled', 'AbortError'),
	new APIUserAbortError(),
	new Error('database transaction aborted')
])('ends and rethrows a failed turn: %s', async (error) => {
	const result = await (async () => {
		try {
			for await (const value of telemetry.turns.run(
				params,
				async function* () {
					yield 'started';
					throw error;
				},
				() => 'unused'
			)) {
				void value;
			}
			return { kind: 'completed' as const };
		} catch (caught) {
			return { kind: 'failure' as const, error: caught };
		}
	})();
	const cancellation = error.name === 'AbortError' || error instanceof APIUserAbortError;
	expect({
		result,
		spans: exporter
			.getFinishedSpans()
			.map((span) => ({ code: span.status.code, output: span.attributes['output.value'] }))
	}).toEqual({
		result: { kind: 'failure', error },
		spans: [
			{
				code: cancellation ? SpanStatusCode.OK : SpanStatusCode.ERROR,
				output: cancellation ? 'cancelled' : undefined
			}
		]
	});
});

it('ends a turn when its consumer stops early', async () => {
	for await (const value of telemetry.turns.run(
		params,
		async function* () {
			yield 'partial';
			yield 'unconsumed';
		},
		() => 'partial'
	)) {
		void value;
		break;
	}
	expect(
		exporter
			.getFinishedSpans()
			.map((span) => ({ name: span.name, output: span.attributes['output.value'] }))
	).toEqual([{ name: 'agent.turn', output: 'partial' }]);
});

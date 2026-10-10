import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { APIUserAbortError } from 'openai';
import { createTelemetryCapability } from '$lib/server/factories/telemetry';
const telemetry = createTelemetryCapability();
const traceOperation = telemetry.operations.run;
const traceWorkflow = telemetry.workflows.run;

const exporter = new InMemorySpanExporter();
const provider = new NodeSDK({
	autoDetectResources: false,
	spanProcessors: [new SimpleSpanProcessor(exporter)],
	logRecordProcessors: [],
	instrumentations: []
});
beforeAll(() => provider.start());
beforeEach(() => exporter.reset());
afterAll(async () => {
	await provider.shutdown();
	trace.disable();
	context.disable();
});

it.each([
	{ kind: 'operation', observe: traceOperation },
	{ kind: 'workflow', observe: traceWorkflow }
])('records an aborted database transaction as a failure in a $kind', async ({ observe }) => {
	await observe('database-write', {}, async () => {
		throw new Error(
			'current transaction is aborted, commands ignored until end of transaction block'
		);
	}).catch(() => ({ kind: 'failure' }));
	expect(exporter.getFinishedSpans()[0]?.status.code).toBe(SpanStatusCode.ERROR);
});

it('keeps a native abort as cancellation', async () => {
	await traceOperation('cancelled-request', {}, async () => {
		throw new DOMException('The operation was aborted', 'AbortError');
	}).catch(() => ({ kind: 'failure' }));
	expect(exporter.getFinishedSpans()[0]).toMatchObject({
		status: { code: SpanStatusCode.OK },
		attributes: { 'output.value': 'cancelled' }
	});
});

it('keeps the actual provider SDK user abort as cancellation', async () => {
	await traceOperation('cancelled-provider', {}, async () => {
		throw new APIUserAbortError();
	}).catch(() => ({ kind: 'failure' }));
	expect(exporter.getFinishedSpans()[0]).toMatchObject({
		status: { code: SpanStatusCode.OK },
		attributes: { 'output.value': 'cancelled' }
	});
});

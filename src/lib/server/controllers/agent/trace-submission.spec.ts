import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { instrumentedController } from '$lib/server/factories/controller-instrumentation';
import { controllerSurfaces } from '$lib/server/factories/controller-surfaces';
import { agentSubmissionFixture } from '$lib/testing/agent/fixtures/submission';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const exporter = new InMemorySpanExporter();
const sdk = new NodeSDK({
	autoDetectResources: false,
	spanProcessors: [new SimpleSpanProcessor(exporter)],
	logRecordProcessors: [],
	instrumentations: []
});
beforeAll(() => sdk.start());
afterAll(async () => {
	await sdk.shutdown();
	trace.disable();
	context.disable();
});

it('persists the active submission and retry contexts on their own durable runs', async () => {
	const fixture = agentSubmissionFixture();
	const controller = instrumentedController('agent', fixture.controller, controllerSurfaces.agent);
	try {
		const receipt = await controller.submit(testActor(), {
			requestId: crypto.randomUUID(),
			input: 'Remember this request'
		});
		await controller.cancel(testActor(), receipt.runId);
		const retry = await controller.retry(testActor(), receipt.runId, crypto.randomUUID());
		const spans = exporter.getFinishedSpans();
		const submission = spans.find((span) => span.name === 'agent.submit');
		const retried = spans.find((span) => span.name === 'agent.retry');
		if (!submission || !retried) throw new Error('Request spans are missing');
		expect({
			submitted: fixture.runs.runs.find((run) => run.id === receipt.runId)?.traceparent,
			retried: fixture.runs.runs.find((run) => run.id === retry.runId)?.traceparent
		}).toEqual({
			submitted: `00-${submission.spanContext().traceId}-${submission.spanContext().spanId}-01`,
			retried: `00-${retried.spanContext().traceId}-${retried.spanContext().spanId}-01`
		});
	} finally {
		for (const run of fixture.runs.runs) await fixture.controller.cancel(testActor(), run.id);
		fixture.release();
		await vi.waitFor(() => {
			if (fixture.runs.runs.some((run) => run.status !== 'cancelled'))
				throw new Error('Fixture runs are still active');
		});
	}
});

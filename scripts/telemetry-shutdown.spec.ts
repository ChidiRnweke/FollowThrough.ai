import { expect, it } from 'vitest';
import {
	BasicTracerProvider,
	BatchSpanProcessor,
	type SpanExporter
} from '@opentelemetry/sdk-trace-base';
import { createTelemetryShutdown } from './telemetry-shutdown.js';

const setup = () => {
	const delivered: string[] = [];
	const exporter: SpanExporter = {
		export(spans, complete) {
			delivered.push(...spans.map((span) => span.name));
			complete({ code: 0 });
		},
		async shutdown() {}
	};
	const provider = new BasicTracerProvider({
		spanProcessors: [new BatchSpanProcessor(exporter, { scheduledDelayMillis: 60_000 })]
	});
	return {
		delivered,
		tracer: provider.getTracer('shutdown-test'),
		shutdown: createTelemetryShutdown(() => provider.shutdown())
	};
};
it('exports a task span that finishes while process shutdown is draining', async () => {
	const { delivered, tracer, shutdown } = setup();
	let finish = () => {};
	const draining = new Promise<void>((resolve) => {
		finish = resolve;
	});
	shutdown.waitFor(() => draining);
	const span = tracer.startSpan('worker.finishing');
	const preloadSignal = shutdown.shutdown();
	await Promise.resolve();
	span.end();
	finish();
	await Promise.all([preloadSignal, shutdown.shutdown()]);
	expect(delivered).toEqual(['worker.finishing']);
});
it('flushes standalone process spans without an application drain', async () => {
	const { delivered, tracer, shutdown } = setup();
	tracer.startSpan('script.finished').end();
	await shutdown.shutdown();
	expect(delivered).toEqual(['script.finished']);
});
it('still exports completed spans when application draining fails', async () => {
	const { delivered, tracer, shutdown } = setup();
	shutdown.waitFor(async () => {
		tracer.startSpan('worker.failed').end();
		throw new Error('Drain failed');
	});
	const outcome = await shutdown.shutdown().then(
		() => 'complete',
		(error: Error) => error.message
	);
	expect({ delivered, outcome }).toEqual({ delivered: ['worker.failed'], outcome: 'Drain failed' });
});

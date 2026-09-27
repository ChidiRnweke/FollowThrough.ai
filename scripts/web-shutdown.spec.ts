import { expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { createServer, get } from 'node:http';
import {
	BasicTracerProvider,
	BatchSpanProcessor,
	type SpanExporter
} from '@opentelemetry/sdk-trace-base';
import { createTelemetryShutdown } from './telemetry-shutdown.js';
import { registerWebShutdown } from './web-shutdown.js';

it('exports the final request span after the web server drains active connections', async () => {
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
	const shutdown = createTelemetryShutdown(() => provider.shutdown());
	const events = new EventEmitter();
	registerWebShutdown(events, shutdown);
	let finish = () => {};
	let markStarted = () => {};
	const started = new Promise<void>((resolve) => {
		markStarted = resolve;
	});
	const server = createServer((_request, response) => {
		const span = provider.getTracer('http-drain').startSpan('request.finishing');
		finish = () => {
			span.end();
			response.end('complete');
		};
		markStarted();
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Expected a TCP server');
	const response = new Promise<string>((resolve, reject) => {
		get(`http://127.0.0.1:${address.port}`, { agent: false }, (reply) => {
			let body = '';
			reply.on('data', (data) => {
				body += data;
			});
			reply.on('end', () => resolve(body));
		}).on('error', reject);
	});
	try {
		await started;
		const preloadSignal = shutdown.shutdown();
		server.close(() => events.emit('sveltekit:shutdown', 'SIGTERM'));
		await Promise.resolve();
		finish();
		await preloadSignal;
		expect({ body: await response, delivered }).toEqual({
			body: 'complete',
			delivered: ['request.finishing']
		});
	} finally {
		server.closeAllConnections();
		server.close();
		events.emit('sveltekit:shutdown', 'SIGTERM');
		await shutdown.shutdown();
	}
});
it('flushes on the adapter shutdown event even without a preload signal', async () => {
	const events = new EventEmitter();
	let flushed = false;
	const shutdown = createTelemetryShutdown(async () => {
		flushed = true;
	});
	registerWebShutdown(events, shutdown);
	events.emit('sveltekit:shutdown', 'SIGINT');
	await shutdown.shutdown();
	expect(flushed).toBe(true);
});

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { traceOperation } from './tracing';
import { tracedService } from './service-boundary';

interface Ledger {
	readonly label: string;
	total(values: readonly number[]): Promise<number>;
	double(value: number): number;
	reject(): Promise<never>;
	explode(): number;
	report(values: readonly number[]): Promise<string>;
}

class LedgerService implements Ledger {
	readonly label = 'ledger';

	async total(values: readonly number[]): Promise<number> {
		return values.reduce((sum, value) => sum + value, 0);
	}

	double(value: number): number {
		return value * 2;
	}

	async reject(): Promise<never> {
		throw new Error('ledger unavailable');
	}

	explode(): number {
		throw new Error('sync failure');
	}

	/** Calls its own method: the internal call must not open a second span. */
	async report(values: readonly number[]): Promise<string> {
		return `total ${await this.total(values)}`;
	}
}

describe('tracedService', () => {
	let exporter: InMemorySpanExporter;
	let provider: NodeSDK;

	beforeAll(() => {
		exporter = new InMemorySpanExporter();
		provider = new NodeSDK({
			autoDetectResources: false,
			spanProcessors: [new SimpleSpanProcessor(exporter)],
			logRecordProcessors: [],
			instrumentations: []
		});
		provider.start();
	});

	beforeEach(() => {
		exporter.reset();
	});

	afterAll(async () => {
		await provider.shutdown();
		trace.disable();
		context.disable();
	});

	const ledger = (): Ledger => tracedService('LedgerService', new LedgerService());
	const spans = () => exporter.getFinishedSpans();

	test('opens one span per call, under the operation that made it', async () => {
		const result = await traceOperation('notes.save', { kind: null }, () =>
			ledger().total([1, 2, 3])
		);

		const operation = spans().find((span) => span.name === 'notes.save');
		const call = spans().find((span) => span.name === 'LedgerService.total');
		expect({
			result,
			parent: call?.parentSpanContext?.spanId,
			status: call?.status.code
		}).toEqual({ result: 6, parent: operation?.spanContext().spanId, status: SpanStatusCode.OK });
	});

	test('leaves spans the service starts under the operation, so Phoenix keeps them joined', async () => {
		class ProviderService {
			async generate(): Promise<string> {
				trace.getTracer('test').startSpan('llm.generate').end();
				return 'text';
			}
		}
		const provider = tracedService('ProviderService', new ProviderService());

		await traceOperation('inline.suggestion', { kind: null }, () => provider.generate());

		const parentOf = (name: string) =>
			spans().find((span) => span.name === name)?.parentSpanContext?.spanId;
		const operation = spans().find((span) => span.name === 'inline.suggestion');
		expect({
			llm: parentOf('llm.generate'),
			service: parentOf('ProviderService.generate')
		}).toEqual({
			llm: operation?.spanContext().spanId,
			service: operation?.spanContext().spanId
		});
	});

	test('keeps a synchronous method synchronous', async () => {
		const result = await traceOperation('op', { kind: null }, async () => ledger().double(21));

		expect({ result, names: spans().map((span) => span.name) }).toEqual({
			result: 42,
			names: ['LedgerService.double', 'op']
		});
	});

	test('records a rejection on the span and rethrows the same error', async () => {
		const outcome = await traceOperation('op', { kind: null }, () => ledger().reject()).catch(
			(error: Error) => error.message
		);

		const call = spans().find((span) => span.name === 'LedgerService.reject');
		expect({ outcome, status: call?.status }).toEqual({
			outcome: 'ledger unavailable',
			status: { code: SpanStatusCode.ERROR, message: 'ledger unavailable' }
		});
	});

	test('throws a synchronous failure synchronously and records it', async () => {
		const outcome = await traceOperation('op', { kind: null }, async () => {
			try {
				return ledger().explode();
			} catch (error) {
				return error instanceof Error ? `thrown: ${error.message}` : 'not an error';
			}
		});

		const call = spans().find((span) => span.name === 'LedgerService.explode');
		expect({ outcome, status: call?.status.code }).toEqual({
			outcome: 'thrown: sync failure',
			status: SpanStatusCode.ERROR
		});
	});

	test('adds no span for a service calling its own method', async () => {
		await traceOperation('op', { kind: null }, () => ledger().report([2, 2]));

		expect(spans().map((span) => span.name)).toEqual(['LedgerService.report', 'op']);
	});

	test('opens no span outside a trace, so background work makes no detached roots', async () => {
		const result = await ledger().total([4, 5]);

		expect({ result, spans: spans().length }).toEqual({ result: 9, spans: 0 });
	});

	test('passes properties that are not methods through unchanged', () => {
		expect(ledger().label).toBe('ledger');
	});
});

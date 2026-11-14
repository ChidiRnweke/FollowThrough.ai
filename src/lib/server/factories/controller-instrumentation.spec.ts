import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import { ValidationError } from '$lib/errors';
import type { UserId } from '$lib/models/identity';
import { instrumentedController } from '$lib/server/factories/controller-instrumentation';
import type { BoundaryScope, ControllerSurface } from '$lib/models/controller-boundary';
import { traceOperation } from '$lib/server/infrastructure/telemetry/tracing';

type RecordedEntry = { readonly level: string; readonly args: readonly unknown[] };

interface FakeControllerContract {
	get(id: string): Promise<{ readonly id: string }>;
	domainFailure(): Promise<never>;
	bug(): Promise<never>;
	_helper(): Promise<string>;
}

class FakeController implements FakeControllerContract {
	constructor(
		private readonly greeting: string,
		private readonly enter: () => void = () => {}
	) {}

	async get(id: string): Promise<{ readonly id: string }> {
		this.enter();
		return { id: `${this.greeting}:${id}` };
	}

	async list(): Promise<readonly string[]> {
		return ['a', 'b', 'c'];
	}

	async nested(): Promise<{ readonly id: string }> {
		return this.get('n1');
	}

	declaredAsyncFailure(): Promise<never> {
		throw new ValidationError('failed before returning a promise');
	}

	async domainFailure(): Promise<never> {
		throw new ValidationError('name already taken');
	}

	async bug(): Promise<never> {
		throw new Error('database connection lost');
	}

	async _helper(): Promise<string> {
		return 'internal';
	}

	/** Mirrors `Agent.freezeInput`: a sync helper public methods call without `await`. */
	private freezeLike(input: string): string {
		return `frozen:${input}`;
	}

	async submitLike(input: string): Promise<string> {
		const frozen = this.freezeLike(input);
		return frozen;
	}

	syncThrower(): string {
		throw new ValidationError('sync domain failure');
	}

	async exchange(code: string): Promise<{ readonly kind: 'issued'; readonly accessToken: string }> {
		return { kind: 'issued', accessToken: `token-for-${code}` };
	}

	/** Mirrors an OAuth refusal: an expected failure returned as a value, not thrown. */
	async refuse(
		code: string
	): Promise<{ readonly kind: 'failure'; readonly error: string; readonly description: string }> {
		return { kind: 'failure', error: 'invalid_grant', description: `No code like ${code.length}.` };
	}
}

const fakeSurface = {
	get: true,
	list: true,
	domainFailure: true,
	bug: true,
	_helper: false,
	submitLike: true,
	syncThrower: false,
	nested: true,
	declaredAsyncFailure: true,
	exchange: 'redacted',
	refuse: 'redacted'
} satisfies ControllerSurface<FakeController>;

const user: BoundaryScope = { kind: 'actor', userId: 'user-1' as UserId };
const system: BoundaryScope = { kind: 'system' };

const recordingLogger = (entries: RecordedEntry[]) => ({
	info: (...args: unknown[]) => {
		entries.push({ level: 'info', args });
	},
	debug: (...args: unknown[]) => {
		entries.push({ level: 'debug', args });
	},
	warn: (...args: unknown[]) => {
		entries.push({ level: 'warn', args });
	},
	error: (...args: unknown[]) => {
		entries.push({ level: 'error', args });
	}
});

/** Wraps a fresh FakeController and returns it with the log it writes. */
const wrap = (scope: BoundaryScope = user, controller = new FakeController('hello')) => {
	const entries: RecordedEntry[] = [];
	return {
		entries,
		wrapped: instrumentedController(
			'fake',
			controller,
			fakeSurface,
			scope,
			recordingLogger(entries)
		)
	};
};

const lines = (entries: readonly RecordedEntry[], level: string) =>
	entries.filter((entry) => entry.level === level).map((entry) => entry.args.map(String).join(' '));

describe('instrumentedController', () => {
	let savedLogLevel: string | undefined;

	beforeEach(() => {
		savedLogLevel = process.env.LOG_LEVEL;
		process.env.LOG_LEVEL = 'debug';
	});

	afterEach(() => {
		if (savedLogLevel === undefined) delete process.env.LOG_LEVEL;
		else process.env.LOG_LEVEL = savedLogLevel;
	});

	test('writes one info line on completion with the user, every argument, the outcome and the duration', async () => {
		const { wrapped, entries } = wrap();

		await wrapped.get('n1');

		const [line] = lines(entries, 'info');
		expect({
			count: lines(entries, 'info').length,
			message: line.split(' {')[0],
			context: JSON.parse(line.slice(line.indexOf('{')))
		}).toEqual({
			count: 1,
			message: expect.stringMatching(/^\[fake\] get completed in \d+ms$/),
			context: { userId: 'user-1', args: ['n1'], outcome: 'value' }
		});
	});

	test('names no user for a controller that acts for nobody', async () => {
		const { wrapped, entries } = wrap(system);

		await wrapped.list();

		expect(lines(entries, 'info')).toEqual([
			expect.stringMatching(/completed in \d+ms \{"args":\[\],"outcome":"3 items"\}$/)
		]);
	});

	test('logs the start at debug, before the method body runs', async () => {
		const sequence: string[] = [];
		const controller = new FakeController('hello', () => sequence.push('body'));
		const wrapped = instrumentedController('fake', controller, fakeSurface, user, {
			...recordingLogger([]),
			debug: (message: string) => {
				if (message.endsWith('started')) sequence.push('started');
			},
			info: () => {
				sequence.push('completed');
			}
		});

		await wrapped.get('n1');

		expect(sequence).toEqual(['started', 'body', 'completed']);
	});

	test('logs a returned failure as a warning with its reason, even when the call is redacted', async () => {
		const { wrapped, entries } = wrap();

		await wrapped.refuse('secret-refresh-token');

		expect({
			info: lines(entries, 'info'),
			warn: lines(entries, 'warn').map((line) => JSON.parse(line.slice(line.indexOf('{')))),
			leaksArgument: JSON.stringify(entries).includes('secret-refresh-token')
		}).toEqual({
			info: [],
			warn: [
				{
					userId: 'user-1',
					args: '[redacted]',
					failure: { error: 'invalid_grant', description: 'No code like 20.' }
				}
			],
			leaksArgument: false
		});
	});

	test('logs a redacted call without its arguments or its result', async () => {
		const { wrapped, entries } = wrap();

		await wrapped.exchange('authorization-code-123');

		const logged = JSON.stringify(entries.map((entry) => entry.args.map(String)));
		expect({
			levels: entries.map((entry) => entry.level),
			outcome: lines(entries, 'info')[0].endsWith('"outcome":"issued"}'),
			leaksCode: logged.includes('authorization-code-123'),
			leaksToken: logged.includes('token-for-')
		}).toEqual({ levels: ['debug', 'info'], outcome: true, leaksCode: false, leaksToken: false });
	});

	test('keeps the full result at debug for a call that is not redacted', async () => {
		const { wrapped, entries } = wrap();

		await wrapped.get('n1');

		expect(lines(entries, 'debug')).toContain('[fake] get result {"id":"hello:n1"}');
	});

	test('does not add another boundary for an internal public-method call', async () => {
		const { wrapped, entries } = wrap();

		await wrapped.nested();

		expect(lines(entries, 'info').map((line) => line.split(' completed')[0])).toEqual([
			'[fake] nested'
		]);
	});

	test('logs a synchronous throw from a declared asynchronous capability', async () => {
		const { wrapped, entries } = wrap();

		await wrapped.declaredAsyncFailure().catch(() => undefined);

		expect(entries.map((entry) => entry.level)).toEqual(['debug', 'warn']);
	});

	test('keeps the instance binding so methods see constructor state', async () => {
		const { wrapped } = wrap();

		expect(await wrapped.get('n1')).toEqual({ id: 'hello:n1' });
	});

	test('rethrows domain failures', async () => {
		const { wrapped } = wrap();

		await expect(wrapped.domainFailure()).rejects.toBeInstanceOf(ValidationError);
	});

	test('logs domain failures as warnings with the call, not errors', async () => {
		const { wrapped, entries } = wrap();

		await wrapped.domainFailure().catch(() => undefined);

		expect(entries.filter((entry) => entry.level !== 'debug')).toEqual([
			{
				level: 'warn',
				args: [
					expect.stringMatching(/^\[fake\] domainFailure failed in \d+ms$/),
					expect.any(ValidationError),
					'{"userId":"user-1","args":[]}'
				]
			}
		]);
	});

	test('logs unexpected failures as errors', async () => {
		const { wrapped, entries } = wrap();

		await wrapped.bug().catch(() => undefined);

		expect(entries.some((entry) => entry.level === 'error' && entry.args[1] instanceof Error)).toBe(
			true
		);
	});

	test('does not wrap underscore-prefixed helpers', async () => {
		const { wrapped, entries } = wrap();

		await wrapped._helper();

		expect(entries).toHaveLength(0);
	});

	test('passes synchronous methods through without logging or changing their contract', () => {
		const { wrapped, entries } = wrap();

		const result = (wrapped as unknown as { freezeLike(input: string): string }).freezeLike('note');

		expect({ result, entries }).toEqual({ result: 'frozen:note', entries: [] });
	});

	test('keeps a synchronous throw synchronous instead of becoming a rejection', () => {
		const { wrapped } = wrap();

		expect(() => wrapped.syncThrower()).toThrow(ValidationError);
	});

	test('lets a public method use its synchronous helpers, as submit does freezeInput', async () => {
		const { wrapped } = wrap();

		expect(await wrapped.submitLike('note')).toBe('frozen:note');
	});
});

describe('controller-boundary span routing', () => {
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

	test('does not stamp openinference.span.kind on controller-boundary spans', async () => {
		const { wrapped } = wrap();

		await wrapped.get('n1');

		const span = exporter.getFinishedSpans().find((candidate) => candidate.name === 'fake.get');
		expect(span?.attributes[SemanticConventions.OPENINFERENCE_SPAN_KIND]).toBeUndefined();
	});

	test('still stamps CHAIN on ordinary operation spans', async () => {
		await traceOperation('workflow.op', {}, async () => 'done');

		const span = exporter.getFinishedSpans().find((candidate) => candidate.name === 'workflow.op');
		expect(span?.attributes[SemanticConventions.OPENINFERENCE_SPAN_KIND]).toBe('CHAIN');
	});

	test('parents work started before the first await under the controller span', async () => {
		const controller = new FakeController('hello', () => {
			trace.getTracer('test').startSpan('before-await').end();
		});
		const { wrapped } = wrap(user, controller);
		await wrapped.get('n1');
		const spans = exporter.getFinishedSpans();
		const boundary = spans.find((span) => span.name === 'fake.get');
		const child = spans.find((span) => span.name === 'before-await');
		if (!boundary || !child) throw new Error('Expected controller and child spans');
		expect(child.parentSpanContext?.spanId).toBe(boundary.spanContext().spanId);
	});
});

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { context, ROOT_CONTEXT, type Context, type ContextManager } from '@opentelemetry/api';
import {
	activeTraceparent,
	logLevelEnabled,
	resolveLogLevel,
	summarize,
	traceOperation
} from '$lib/server/services/telemetry';

/**
 * Vitest loads no OTel SDK, so the global context manager is a no-op and
 * `context.with` would not propagate the workflow marker the nesting tests
 * assert on. This is the same AsyncLocalStorage wiring the NodeSDK registers
 * in production — test plumbing, not a stand-in for application code.
 */
class AsyncStorageContextManager implements ContextManager {
	private readonly storage = new AsyncLocalStorage<Context>();

	active(): Context {
		return this.storage.getStore() ?? ROOT_CONTEXT;
	}

	with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
		next: Context,
		fn: F,
		thisArg?: ThisParameterType<F>,
		...args: A
	): ReturnType<F> {
		return this.storage.run(next, fn, ...args);
	}

	bind<T>(next: Context, target: T): T {
		return target;
	}

	enable(): this {
		return this;
	}

	disable(): this {
		return this;
	}
}

describe('workflow-only telemetry', () => {
	test('executes background work without applying span result processing', async () => {
		const result = await traceOperation(
			'embedding.batch',
			{ onlyWithinWorkflow: true },
			async () => 'completed',
			() => {
				throw new Error('background work should not create a span');
			}
		);

		expect(result).toBe('completed');
	});
});

describe('operation nesting', () => {
	beforeAll(() => {
		context.setGlobalContextManager(new AsyncStorageContextManager());
	});

	afterAll(() => {
		context.disable();
	});

	test('marks its context so a nested workflow-only operation creates a span', async () => {
		let described = false;
		await traceOperation('outer', {}, async () => {
			await traceOperation(
				'inner',
				{ onlyWithinWorkflow: true },
				async () => 'done',
				() => {
					described = true;
					return 'output';
				}
			);
		});

		expect(described).toBe(true);
	});
});

describe('resolveLogLevel', () => {
	test('defaults to debug outside production and test runs', () => {
		expect(resolveLogLevel({})).toBe('debug');
	});

	test('defaults to info in production', () => {
		expect(resolveLogLevel({ NODE_ENV: 'production' })).toBe('info');
	});

	test('LOG_LEVEL overrides the environment default', () => {
		expect(resolveLogLevel({ NODE_ENV: 'production', LOG_LEVEL: 'debug' })).toBe('debug');
	});
});

describe('logLevelEnabled', () => {
	test('suppresses debug records when the resolved level is info', () => {
		expect(logLevelEnabled('debug', { LOG_LEVEL: 'info' })).toBe(false);
	});

	test('allows error records at every resolved level', () => {
		expect(logLevelEnabled('error', { LOG_LEVEL: 'error' })).toBe(true);
	});
});

describe('summarize', () => {
	test('elides base64 data URLs', () => {
		const summary = summarize({ image: `data:image/png;base64,${'A'.repeat(2048)}` });

		expect(summary).toContain('<base64 elided');
	});

	test('caps the rendering at maxChars', () => {
		const summary = summarize({ text: 'x'.repeat(1000) }, 100);

		expect(summary.length).toBeLessThanOrEqual(140);
	});
});

describe('activeTraceparent', () => {
	test('is undefined outside any span', () => {
		expect(activeTraceparent()).toBeUndefined();
	});
});

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { context, ROOT_CONTEXT, type Context, type ContextManager } from '@opentelemetry/api';
import { createTelemetryCapability } from '$lib/server/factories/telemetry';
const telemetry = createTelemetryCapability();
const activeTraceparent = telemetry.traceContext.activeTraceparent.bind(telemetry.traceContext);
const traceOperation = telemetry.operations.run;

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

describe('activeTraceparent', () => {
	test('is undefined outside any span', () => {
		expect(activeTraceparent()).toBeUndefined();
	});
});

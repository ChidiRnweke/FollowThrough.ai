import { DomainError } from '$lib/errors';
import { logLevelEnabled, summarize, traceOperation } from '$lib/server/services/telemetry';

type BoundaryLogger = Pick<Console, 'info' | 'debug' | 'warn' | 'error'>;

/**
 * Central boundary instrumentation for controllers.
 *
 * Every public prototype method is shadowed with a wrapper that opens a
 * `domain.method` operation span and logs around the call: `info` before
 * (actor + summarised arguments), `debug` after (duration + summarised
 * result), `warn` for domain failures (expected outcomes — mirrors
 * `handleError` in hooks.server.ts) and `error` for anything else. Applied
 * once in ProductionControllerFactory, so UI remote functions, the MCP
 * endpoint and agent tool calls are all covered without per-controller code,
 * and every record inherits the operation span's trace id via the console
 * bridge. Payloads are summarised, never logged raw.
 *
 * TypeScript `private` is erased at runtime, so a controller's internal
 * helpers show up here alongside its public API. A helper with a synchronous
 * contract is called without `await`; wrapping it in an async function would
 * hand its caller a Promise where a value was expected (this broke
 * `Agent.submit`, whose sync `freezeInput` suddenly returned one). Synchronous
 * methods therefore pass through uninstrumented with their contract intact —
 * only promise-returning methods get the span and the logs, which also means
 * the `info` record is written as the call starts settling rather than before
 * the body's synchronous prefix runs.
 *
 * Call sites must not add their own boundary logging — this is the coverage
 * mechanism; log at `debug` inside services for finer detail.
 */
export const instrumentedController = <T extends object>(
	domain: string,
	controller: T,
	logger: BoundaryLogger = console
): T => {
	const prototype = Object.getPrototypeOf(controller);
	for (const name of Object.getOwnPropertyNames(prototype)) {
		if (name === 'constructor' || name.startsWith('_')) continue;
		const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
		if (!descriptor || typeof descriptor.value !== 'function') continue;
		const method = descriptor.value as (...args: unknown[]) => unknown;
		const wrapped = (...args: unknown[]): unknown => {
			const result = Reflect.apply(method, controller, args);
			if (!result || typeof (result as Promise<unknown>).then !== 'function') return result;
			const pending = result as Promise<unknown>;
			return traceOperation(`${domain}.${name}`, {}, async () => {
				const [actor, ...rest] = args;
				const userId =
					typeof actor === 'object' && actor !== null && 'userId' in actor
						? (actor as { userId: unknown }).userId
						: undefined;
				if (logLevelEnabled('info'))
					logger.info(
						`[${domain}] ${name}`,
						summarize({ ...(userId !== undefined ? { userId } : {}), args: rest })
					);
				const startedAt = performance.now();
				try {
					const value = await pending;
					if (logLevelEnabled('debug'))
						logger.debug(
							`[${domain}] ${name} completed in ${Math.round(performance.now() - startedAt)}ms`,
							summarize(value)
						);
					return value;
				} catch (error) {
					if (error instanceof DomainError) {
						if (logLevelEnabled('warn')) logger.warn(`[${domain}] ${name} failed`, error);
					} else {
						logger.error(`[${domain}] ${name} failed`, error);
					}
					throw error;
				}
			});
		};
		Object.defineProperty(controller, name, {
			value: wrapped,
			configurable: true,
			writable: true
		});
	}
	return controller;
};

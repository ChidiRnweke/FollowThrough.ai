import { DomainError } from '$lib/errors';
import { logLevelEnabled, summarize, traceOperation } from '$lib/server/services/telemetry';

type BoundaryLogger = Pick<Console, 'info' | 'debug' | 'warn' | 'error'>;
export type ControllerSurface<T> = {
	readonly [K in keyof T]:
		false | (T[K] extends (...args: never[]) => PromiseLike<infer _Value> ? true : never);
};

/**
 * Instrument the declared public asynchronous capabilities before executing them.
 * The facade binds calls to the original instance. Internal calls and synchronous
 * helpers keep their contracts and do not create additional boundary spans.
 */
export const instrumentedController = <T extends object>(
	domain: string,
	controller: T,
	surface: ControllerSurface<T>,
	logger: BoundaryLogger = console
): T => {
	// audit-allow: no-unknown-type — The boundary facade preserves heterogeneous controller method signatures.
	const methods = new Map<PropertyKey, (...args: unknown[]) => unknown>();
	return new Proxy(controller, {
		get(target, name) {
			const value = Reflect.get(target, name, target);
			if (typeof value !== 'function') return value;
			const cached = methods.get(name);
			if (cached) return cached;
			if (!Object.hasOwn(surface, name) || !surface[name as keyof T]) return value.bind(target);
			// audit-allow: no-unknown-type — One wrapper handles each declared capability without changing its input or output.
			const wrapped = (...args: unknown[]): Promise<unknown> =>
				traceOperation(`${domain}.${String(name)}`, { kind: null }, async () => {
					const [actor, ...rest] = args;
					const userId =
						typeof actor === 'object' && actor !== null && 'userId' in actor
							? actor.userId
							: undefined;
					if (logLevelEnabled('info'))
						logger.info(
							`[${domain}] ${String(name)}`,
							summarize({ ...(userId !== undefined ? { userId } : {}), args: rest })
						);
					const startedAt = performance.now();
					try {
						const result = await Reflect.apply(value, target, args);
						if (logLevelEnabled('debug'))
							logger.debug(
								`[${domain}] ${String(name)} completed in ${Math.round(performance.now() - startedAt)}ms`,
								summarize(result)
							);
						return result;
					} catch (error) {
						if (error instanceof DomainError) {
							if (logLevelEnabled('warn')) logger.warn(`[${domain}] ${String(name)} failed`, error);
						} else logger.error(`[${domain}] ${String(name)} failed`, error);
						throw error;
					}
				});
			methods.set(name, wrapped);
			return wrapped;
		}
	});
};

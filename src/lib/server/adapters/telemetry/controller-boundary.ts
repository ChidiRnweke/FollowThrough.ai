import { DomainError } from '$lib/errors';
import type { OperationObserver } from '$lib/server/adapters/telemetry/tracing';
import type {
	TelemetryLogging,
	TelemetryClock,
	BoundaryLogger
} from '$lib/server/adapters/telemetry/logging';
import type { ControllerSurface } from '$lib/models/controller-boundary';

/** Runtime boundary middleware. Construction creates a facade; calls retain original receivers. */
export class ControllerBoundary<T extends object> {
	readonly controller: T;
	constructor(
		domain: string,
		controller: T,
		surface: ControllerSurface<T>,
		dependencies: {
			observer: OperationObserver;
			logging: TelemetryLogging;
			clock: TelemetryClock;
			logger: BoundaryLogger;
		}
	) {
		const methods = new Map<PropertyKey, (...args: unknown[]) => unknown>();
		this.controller = new Proxy(controller, {
			get(target, name) {
				const value = Reflect.get(target, name, target);
				if (typeof value !== 'function') return value;
				const cached = methods.get(name);
				if (cached) return cached;
				if (!Object.hasOwn(surface, name) || !surface[name as keyof T]) return value.bind(target);

				const wrapped = (...args: unknown[]): Promise<unknown> =>
					dependencies.observer.run(`${domain}.${String(name)}`, { kind: null }, async () => {
						const [actor, ...rest] = args;
						const userId =
							typeof actor === 'object' && actor !== null && 'userId' in actor
								? actor.userId
								: undefined;
						if (dependencies.logging.enabled('info'))
							dependencies.logger.info(
								`[${domain}] ${String(name)}`,
								dependencies.logging.summarize({
									...(userId !== undefined ? { userId } : {}),
									args: rest
								})
							);
						const startedAt = dependencies.clock.now();
						try {
							const result = await Reflect.apply(value, target, args);
							if (dependencies.logging.enabled('debug'))
								dependencies.logger.debug(
									`[${domain}] ${String(name)} completed in ${Math.round(dependencies.clock.now() - startedAt)}ms`,
									dependencies.logging.summarize(result)
								);
							return result;
						} catch (error) {
							if (error instanceof DomainError) {
								if (dependencies.logging.enabled('warn'))
									dependencies.logger.warn(`[${domain}] ${String(name)} failed`, error);
							} else dependencies.logger.error(`[${domain}] ${String(name)} failed`, error);
							throw error;
						}
					});
				methods.set(name, wrapped);
				return wrapped;
			}
		});
	}
}

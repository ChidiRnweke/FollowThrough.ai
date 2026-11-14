import { traceServiceCall } from '$lib/server/infrastructure/telemetry/tracing';

/**
 * Wraps a service so each public method call records a `Service.method` span under the active
 * controller span. The span is a leaf (see `traceServiceCall`). Internal calls keep the unwrapped receiver, so a service calling its own
 * methods adds no spans. `name` is passed in because a production build may rename classes.
 */
export const tracedService = <T extends object>(name: string, service: T): T => {
	const methods = new Map<PropertyKey, (...args: unknown[]) => unknown>();
	return new Proxy(service, {
		get(target, key) {
			const value = Reflect.get(target, key, target);
			if (typeof value !== 'function' || typeof key === 'symbol' || key === 'constructor')
				return value;
			const cached = methods.get(key);
			if (cached) return cached;
			const wrapped = (...args: unknown[]): unknown =>
				traceServiceCall(`${name}.${key}`, () => Reflect.apply(value, target, args));
			methods.set(key, wrapped);
			return wrapped;
		}
	});
};

import { DomainError } from '$lib/errors';
import {
	logLevelEnabled,
	summarize,
	traceOperation
} from '$lib/server/infrastructure/telemetry/tracing';
import type { BoundaryScope, ControllerSurface } from '$lib/models/controller-boundary';
type BoundaryLogger = Pick<Console, 'info' | 'debug' | 'warn' | 'error'>;

/** The fields a returned failure value explains itself with; none carries a credential. */
const FAILURE_REASON_FIELDS = new Set(['error', 'code', 'reason', 'description', 'message']);

/**
 * A returned `{ kind: 'failure' }` value is this codebase's expected refusal (audited by
 * Chisel's silent-catch rule). It is logged as a warning with its reason fields only.
 */
const failureReason = (result: unknown): ReadonlyMap<string, string> | null => {
	if (typeof result !== 'object' || result === null || !('kind' in result)) return null;
	if (result.kind !== 'failure') return null;
	const reason = new Map<string, string>();
	for (const [field, value] of Object.entries(result))
		if (FAILURE_REASON_FIELDS.has(field) && typeof value === 'string') reason.set(field, value);
	return reason;
};

/** What a call returned, without its content: enough to tell outcomes apart in a log. */
const outcomeOf = (result: unknown): string => {
	if (result === undefined || result === null) return 'none';
	if (Array.isArray(result)) return `${result.length} items`;
	if (typeof result === 'object' && 'kind' in result && typeof result.kind === 'string')
		return result.kind;
	return typeof result === 'object' ? 'value' : typeof result;
};

/**
 * Runtime boundary middleware. Construction creates a facade; calls retain original receivers.
 * Each call writes one canonical info line when it completes — arguments, outcome and duration —
 * a warning for a returned failure or a domain error, and an error for anything else.
 */
export class ControllerBoundary<T extends object> {
	readonly controller: T;
	constructor(
		domain: string,
		controller: T,
		surface: ControllerSurface<T>,
		scope: BoundaryScope,
		logger: BoundaryLogger = console
	) {
		const methods = new Map<PropertyKey, (...args: unknown[]) => unknown>();
		const user = scope.kind === 'actor' ? { userId: scope.userId } : {};
		this.controller = new Proxy(controller, {
			get(target, name) {
				const value = Reflect.get(target, name, target);
				if (typeof value !== 'function') return value;
				const cached = methods.get(name);
				if (cached) return cached;
				const exposure = Object.hasOwn(surface, name) ? surface[name as keyof T] : false;
				if (!exposure) return value.bind(target);
				const redacted = exposure === 'redacted';
				const operation = `[${domain}] ${String(name)}`;
				const wrapped = (...args: unknown[]): Promise<unknown> =>
					traceOperation(`${domain}.${String(name)}`, { kind: null }, async () => {
						const call = { ...user, args: redacted ? '[redacted]' : args };
						if (logLevelEnabled('debug')) logger.debug(`${operation} started`, summarize(call));
						const startedAt = performance.now();
						const elapsed = () => `${Math.round(performance.now() - startedAt)}ms`;
						try {
							const result = await Reflect.apply(value, target, args);
							const failure = failureReason(result);
							if (failure) {
								if (logLevelEnabled('warn'))
									logger.warn(
										`${operation} refused in ${elapsed()}`,
										summarize({ ...call, failure: Object.fromEntries(failure) })
									);
							} else {
								if (logLevelEnabled('info'))
									logger.info(
										`${operation} completed in ${elapsed()}`,
										summarize({ ...call, outcome: outcomeOf(result) })
									);
								if (!redacted && logLevelEnabled('debug'))
									logger.debug(`${operation} result`, summarize(result));
							}
							return result;
						} catch (error) {
							if (error instanceof DomainError) {
								if (logLevelEnabled('warn'))
									logger.warn(`${operation} failed in ${elapsed()}`, error, summarize(call));
							} else logger.error(`${operation} failed in ${elapsed()}`, error, summarize(call));
							throw error;
						}
					});
				methods.set(name, wrapped);
				return wrapped;
			}
		});
	}
}

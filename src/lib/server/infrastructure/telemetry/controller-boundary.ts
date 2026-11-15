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

/** A uuid, the shape of every entity id this application mints. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An enum value or short code: lowercase, no spaces. Model enum values stay well under 32. */
const TOKEN = /^[a-z0-9_.-]{1,32}$/;
/**
 * Fields whose string value is a model enum, never user text. A token-shaped string anywhere else
 * can still be a word the user wrote (a one-word title or query), so only these fields keep it.
 */
const ENUM_FIELDS: ReadonlySet<string> = new Set([
	'kind',
	'type',
	'status',
	'state',
	'mode',
	'scope',
	'role',
	'format',
	'reason',
	'code',
	'source',
	'priority'
]);
/**
 * The walk stops here. Its rendering still passes through the 500-character summary cap; about
 * 32 short `key:value` entries fill it, and three levels reach a field of the entity a request
 * carries (`args[0].note.title`). Walking further only produces text the cap cuts off.
 */
const MAX_SHAPE_KEYS = 32;
const MAX_SHAPE_DEPTH = 3;

type Shape =
	| string
	| number
	| boolean
	| null
	| undefined
	| { readonly length: number }
	| { readonly items: number }
	| { readonly bytes: number }
	| { readonly [key: string]: Shape };

/**
 * What a call was given, without its content: ids, numbers, booleans and the enum fields named
 * above as they are; any other string as its length, a collection as its size, an object as the shape of
 * its fields. A bounded walk, so a large argument costs no more than a small one.
 */
const argumentShape = (args: readonly unknown[]): readonly Shape[] => {
	let keys = MAX_SHAPE_KEYS;
	const shape = (value: unknown, depth: number, field?: string): Shape => {
		if (value === null || value === undefined) return value;
		if (typeof value === 'number' || typeof value === 'boolean') return value;
		if (typeof value === 'string')
			return ID.test(value) || (field !== undefined && ENUM_FIELDS.has(field) && TOKEN.test(value))
				? value
				: { length: value.length };
		if (typeof value !== 'object') return typeof value;
		if (Array.isArray(value) || value instanceof Map || value instanceof Set)
			return { items: Array.isArray(value) ? value.length : value.size };
		if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
			return { bytes: value.byteLength };
		if (value instanceof Blob) return { bytes: value.size };
		if (value instanceof Date)
			return Number.isNaN(value.getTime()) ? 'invalid date' : value.toISOString();
		if (depth === MAX_SHAPE_DEPTH) return 'object';
		const fields: { [key: string]: Shape } = {};
		for (const key in value) {
			if (!Object.hasOwn(value, key)) continue;
			if (keys === 0) {
				fields['…'] = 'more fields';
				break;
			}
			keys -= 1;
			fields[key] = shape(Reflect.get(value, key), depth + 1, key);
		}
		return fields;
	};
	return args.map((arg) => shape(arg, 0));
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
 * Each call writes one canonical info line when it completes — the user, the shape of the
 * arguments, the outcome and the duration — a warning for a returned failure or a domain error,
 * and an error for anything else. The argument content is logged only at debug.
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
						const call = { ...user, args: redacted ? '[redacted]' : argumentShape(args) };
						if (logLevelEnabled('debug'))
							logger.debug(
								`${operation} started`,
								summarize({ ...user, args: redacted ? '[redacted]' : args })
							);
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

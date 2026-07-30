/**
 * Turning `console.*` arguments into an OTel log record.
 *
 * Split out of `otel-instrumentation.js` so it stays free of the OTel SDK and
 * can be exercised directly; the preload imports it. Call sites across the app
 * log with plain `console.*`, so this module is the single place that knows how
 * to make a record queryable in Grafana — anything it drops is gone.
 */

/** Subsystem tag a log line opens with, e.g. `[domain] ...` -> `domain`. */
const TAG_PATTERN = /^\[([\w-]+)\]/;

/**
 * JSON that cannot throw. A circular argument would otherwise escape into the
 * bridge's catch and take the whole log record with it.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function safeStringify(value) {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return '[unserializable]';
	}
}

/**
 * Flatten an error and its `cause` chain into one line.
 *
 * Intentionally mirrors `describeError` in src/lib/utils.ts (and
 * `describeClientError` in src/lib/client/report-error.ts) so lines produced
 * here and there read identically in Loki. Kept a separate copy because the
 * preload runs before the app and cannot import from `src/`.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describeErrorChain(error) {
	/** @type {string[]} */
	const parts = [];
	let current = error;
	const seen = new Set();
	while (current !== undefined && current !== null) {
		if (typeof current === 'object') {
			if (seen.has(current)) break;
			seen.add(current);
		}
		if (current instanceof Error) {
			const code = /** @type {{ code?: unknown }} */ (current).code;
			parts.push(
				`${current.name}: ${current.message}${typeof code === 'string' ? ` (${code})` : ''}`
			);
			current = current.cause;
		} else {
			parts.push(typeof current === 'object' ? safeStringify(current) : String(current));
			break;
		}
	}
	return parts.join(' <- ');
}

/**
 * `JSON.stringify(new Error('boom'))` is `"{}"` — Error carries no enumerable
 * own properties — so errors must be rendered before anything else.
 *
 * @param {unknown} arg
 * @returns {string}
 */
export function formatArg(arg) {
	if (arg instanceof Error) return describeErrorChain(arg);
	if (typeof arg === 'object' && arg !== null) return safeStringify(arg);
	return String(arg);
}

/**
 * OTel attributes accept primitives and arrays of primitives only.
 *
 * @param {unknown} value
 * @returns {string | number | boolean}
 */
function attributeValue(value) {
	const type = typeof value;
	if (type === 'string' || type === 'number' || type === 'boolean') {
		return /** @type {string | number | boolean} */ (value);
	}
	return value instanceof Error ? describeErrorChain(value) : safeStringify(value);
}

/**
 * The message body: every argument rendered and joined, as `console.*` would.
 *
 * @param {unknown[]} args
 * @returns {string}
 */
export function formatBody(args) {
	return args.map(formatArg).join(' ');
}

/**
 * Lift structure out of the arguments so Grafana can filter on it instead of
 * running a regex over the message body.
 *
 * `DomainError` (src/lib/errors.ts) is duck-typed rather than imported, for the
 * same preload reason as above: a string `code` alongside a `details` record.
 *
 * @param {unknown[]} args
 * @returns {Record<string, string | number | boolean>}
 */
export function recordAttributes(args) {
	/** @type {Record<string, string | number | boolean>} */
	const attributes = {};

	const tag = typeof args[0] === 'string' ? TAG_PATTERN.exec(args[0]) : null;
	if (tag) attributes['log.tag'] = tag[1];

	const error = args.find((arg) => arg instanceof Error);
	if (!(error instanceof Error)) return attributes;

	attributes['exception.type'] = error.name;
	attributes['exception.message'] = error.message;
	if (typeof error.stack === 'string') attributes['exception.stacktrace'] = error.stack;
	if (error.cause !== undefined && error.cause !== null) {
		attributes['exception.cause'] = describeErrorChain(error.cause);
	}

	const domain = /** @type {{ code?: unknown, details?: unknown }} */ (error);
	if (typeof domain.code === 'string') attributes['error.code'] = domain.code;
	if (typeof domain.details === 'object' && domain.details !== null) {
		for (const [key, value] of Object.entries(domain.details)) {
			attributes[`error.details.${key}`] = attributeValue(value);
		}
	}

	return attributes;
}

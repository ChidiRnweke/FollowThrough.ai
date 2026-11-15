/**
 * What an exported span may carry.
 *
 * Split out of `otel-instrumentation.js` so it stays free of the OTel SDK and
 * can be exercised directly; the preload wraps its trace exporter with it.
 */

/**
 * An attached image rides in the conversation as a base64 data URL and is
 * replayed on every turn, so it lands in `input.value` on the agent and
 * generation spans of every turn of every run. One 326 KB PNG cost ~10 MB of
 * span payload across a single twelve-turn run. Keep enough of the prefix to
 * identify the image, drop the rest.
 */
export const MAX_INLINE_BASE64 = 1024;
const BASE64_DATA_URL = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;

/**
 * MCP authorization codes and tokens (`ftc_`, `fta_`, `ftr_`) are credentials,
 * and an agent span carries whatever a prompt or a tool payload holds. The same
 * pattern `summarize` in src/lib/server/infrastructure/telemetry/tracing.ts
 * applies to log lines, copied because the preload cannot import from `src/`.
 */
const MCP_CREDENTIAL = /\b(ftc|fta|ftr)_[A-Za-z0-9_-]+/g;

/** @param {string} value */
const maskSpanText = (value) =>
	value
		.replace(BASE64_DATA_URL, (match) =>
			match.length <= MAX_INLINE_BASE64
				? match
				: `${match.slice(0, 64)}…<base64 elided, ${match.length} chars>`
		)
		.replace(MCP_CREDENTIAL, '$1_<redacted>');

/**
 * Rewrites span attributes on the way out rather than at the call site, because
 * the payload is assembled inside the agents SDK and its own masking only
 * covers `image.url`-shaped keys, not the serialized `input.value` blob.
 *
 * @template {{ export: Function, shutdown: () => Promise<void>, forceFlush?: () => Promise<void> }} T
 * @param {T} exporter
 * @returns {T}
 */
export function withMaskedSpanAttributes(exporter) {
	const wrapped = {
		/**
		 * @param {{ attributes: Record<string, unknown> }[]} spans
		 * @param {(result: unknown) => void} resultCallback
		 */
		export(spans, resultCallback) {
			for (const span of spans)
				for (const [key, value] of Object.entries(span.attributes))
					if (typeof value === 'string') span.attributes[key] = maskSpanText(value);
			exporter.export(spans, resultCallback);
		},
		shutdown: () => exporter.shutdown(),
		forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve()
	};
	return /** @type {T} */ (/** @type {unknown} */ (wrapped));
}

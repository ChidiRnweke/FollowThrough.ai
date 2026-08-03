/**
 * OpenTelemetry preload.
 *
 * NodeSDK owns provider construction, instrumentation registration and shutdown.
 * Phoenix is not talked to directly: everything goes to the collector over OTLP,
 * and the collector's routing connector fans traces out to Tempo and — for spans
 * carrying the openinference resource attribute set below — to Phoenix. Logs go
 * to the same collector and on to Loki.
 *
 * OTEL_EXPORTER_OTLP_ENDPOINT is a *platform* key: `isPlatformKey` in
 * src/lib/server/config.ts excludes the OTEL_ and PHOENIX_ prefixes from
 * hydration, so a value set in the secrets backend is never read. It comes from
 * docker-compose.prod.yml in prod and from .env (via mergePlatformEnvironment in
 * vite.config.ts) in dev.
 *
 * Telemetry is opt-in: it initialises only when OTEL_EXPORTER_OTLP_ENDPOINT is
 * set. Export failures never propagate into request handling.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { OpenAIAgentsInstrumentation } from '@arizeai/openinference-instrumentation-openai-agents';
import * as agents from '@openai/agents';
import { formatBody, recordAttributes } from './log-record.js';

/** The collector routes on this resource attribute; without it nothing reaches Phoenix. */
const OPENINFERENCE_PROJECT_NAME = 'openinference.project.name';

/**
 * An attached image rides in the conversation as a base64 data URL and is
 * replayed on every turn, so it lands in `input.value` on the agent and
 * generation spans of every turn of every run. One 326 KB PNG cost ~10 MB of
 * span payload across a single twelve-turn run. Keep enough of the prefix to
 * identify the image, drop the rest.
 */
const MAX_INLINE_BASE64 = 1024;
const BASE64_DATA_URL = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;

/** @param {string} value */
const elideInlineBase64 = (value) =>
	value.replace(BASE64_DATA_URL, (match) =>
		match.length <= MAX_INLINE_BASE64
			? match
			: `${match.slice(0, 64)}…<base64 elided, ${match.length} chars>`
	);

/**
 * Rewrites span attributes on the way out rather than at the call site, because
 * the payload is assembled inside the agents SDK and its own masking only
 * covers `image.url`-shaped keys, not the serialized `input.value` blob.
 *
 * @template {OTLPTraceExporter} T
 * @param {T} exporter
 * @returns {T}
 */
function withoutInlineBase64(exporter) {
	const wrapped = {
		/**
		 * @param {{ attributes: Record<string, unknown> }[]} spans
		 * @param {(result: unknown) => void} resultCallback
		 */
		export(spans, resultCallback) {
			for (const span of spans)
				for (const [key, value] of Object.entries(span.attributes))
					if (typeof value === 'string' && value.includes(';base64,'))
						span.attributes[key] = elideInlineBase64(value);
			// @ts-expect-error the wrapped exporter owns the concrete span type.
			exporter.export(spans, resultCallback);
		},
		shutdown: () => exporter.shutdown(),
		forceFlush: () => exporter.forceFlush()
	};
	return /** @type {T} */ (/** @type {unknown} */ (wrapped));
}

/** @type {NodeSDK | null} */
let sdk = null;
let consoleBridged = false;

// Captured at module load, before anything else can patch console.
const originalConsole = {
	log: console.log.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console),
	debug: console.debug.bind(console)
};

const SEVERITY = {
	debug: SeverityNumber.DEBUG,
	log: SeverityNumber.INFO,
	info: SeverityNumber.INFO,
	warn: SeverityNumber.WARN,
	error: SeverityNumber.ERROR
};

/**
 * Route console output through the OTel logger so it reaches the collector's
 * logs pipeline, while still writing to stdout/stderr so `docker logs` keeps
 * working. emit() picks up the active context, so records carry the trace and
 * span ids of the request that produced them.
 *
 * Call sites stay plain `console.*`: everything that makes a record queryable —
 * flattened cause chains, stack traces, domain codes and details — is derived
 * here from whatever arguments they passed.
 */
export function bridgeConsoleLogs() {
	if (consoleBridged) return;

	// NodeSDK registered this global provider during start().
	const logger = logs.getLoggerProvider().getLogger('console');
	const target = /** @type {Record<string, (...args: unknown[]) => void>} */ (
		/** @type {unknown} */ (console)
	);

	for (const [method, severityNumber] of Object.entries(SEVERITY)) {
		target[method] = (/** @type {unknown[]} */ ...args) => {
			originalConsole[/** @type {keyof typeof originalConsole} */ (method)](...args);
			try {
				logger.emit({
					severityNumber,
					severityText: method.toUpperCase(),
					body: formatBody(args),
					attributes: recordAttributes(args)
				});
			} catch {
				// Telemetry must never break the caller.
			}
		};
	}

	consoleBridged = true;
}

/** @param {string} [projectNameOverride] */
export function initTelemetry(projectNameOverride) {
	if (sdk) return sdk;

	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!endpoint) {
		process.stdout.write('[OTel] OTEL_EXPORTER_OTLP_ENDPOINT is not set. Telemetry is disabled.\n');
		return null;
	}

	const projectName = projectNameOverride || process.env.PHOENIX_PROJECT_NAME || 'followthrough';
	const serviceName = process.env.OTEL_SERVICE_NAME || projectName;

	process.stdout.write(
		`[OTel] Initializing telemetry for ${serviceName}. Exporting to ${endpoint}\n`
	);

	// Bridging the OpenAI Agents SDK's own tracing into OpenInference spans is
	// what makes the agent runs show up in Phoenix.
	const agentsInstrumentation = new OpenAIAgentsInstrumentation({
		traceConfig: { base64ImageMaxLength: MAX_INLINE_BASE64 }
	});

	sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: serviceName,
			[ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.1',
			'deployment.environment': process.env.NODE_ENV || 'development',
			[OPENINFERENCE_PROJECT_NAME]: projectName
		}),
		traceExporter: withoutInlineBase64(new OTLPTraceExporter({ url: endpoint })),
		logRecordProcessors: [
			new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: endpoint }) })
		],
		instrumentations: [
			getNodeAutoInstrumentations({
				// Every file read would otherwise become a span.
				'@opentelemetry/instrumentation-fs': { enabled: false },
				'@opentelemetry/instrumentation-dns': { enabled: false },
				'@opentelemetry/instrumentation-net': { enabled: false }
			}),
			agentsInstrumentation
		]
	});

	sdk.start();

	// @openai/agents is ESM, so the module hooks don't reach it; patch it directly.
	agentsInstrumentation.manuallyInstrument(agents);

	bridgeConsoleLogs();

	console.log('[OTel] Telemetry initialized successfully.');
	return sdk;
}

export async function shutdownTelemetry() {
	try {
		if (sdk) await sdk.shutdown();
		process.stdout.write('[OTel] Telemetry shut down successfully.\n');
	} catch (error) {
		process.stderr.write(`[OTel] Error shutting down telemetry: ${error}\n`);
	}
}

const otelGlobal = /** @type {typeof globalThis & { __otel_initialized__?: boolean }} */ (
	globalThis
);
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT && !otelGlobal.__otel_initialized__) {
	otelGlobal.__otel_initialized__ = true;
	initTelemetry();
	process.once('SIGTERM', () => void shutdownTelemetry());
}

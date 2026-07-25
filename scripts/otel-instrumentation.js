/* eslint-disable @typescript-eslint/ban-ts-comment -- Node executes this JavaScript entrypoint directly. */
// @ts-nocheck -- behaviour and dependency contracts are covered by Vitest fakes.
/**
 * OpenTelemetry preload.
 *
 * Loaded before app code via `node --import ./scripts/otel-instrumentation.js build`
 * so the OpenAI Agents instrumentation registers its TracingProcessor before the
 * first Runner.run() call, and so HTTP/pg auto-instrumentation patches the modules
 * before anything imports them.
 *
 * Telemetry is opt-in: it initialises only when OTEL_EXPORTER_OTLP_ENDPOINT is set,
 * and otherwise no-ops. Export failures never propagate into request handling — the
 * fail-hard rule applies to config/secrets, not to trace export.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { trace, context } from '@opentelemetry/api';
import { OpenAIAgentsInstrumentation } from '@arizeai/openinference-instrumentation-openai-agents';
import { OpenAIInstrumentation } from '@arizeai/openinference-instrumentation-openai';
import * as agents from '@openai/agents';
import OpenAI from 'openai';

let sdk = null;
let otelLogger = null;
let consoleBridged = false;

// Capture truly original console methods immediately at module load
// (before any code has a chance to patch them)
const originalConsole = {
	log: console.log.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console),
	debug: console.debug.bind(console)
};

/**
 * Bridge console.log/warn/error to OpenTelemetry logs
 */
function bridgeConsoleLogs() {
	// Prevent double-patching which would cause infinite recursion
	if (consoleBridged) {
		originalConsole.warn('[OTel] Console already bridged, skipping');
		return;
	}

	// Get the global logger provider that NodeSDK sets up
	const loggerProvider = logs.getLoggerProvider();
	otelLogger = loggerProvider.getLogger('console');

	const severityMap = {
		debug: SeverityNumber.DEBUG,
		log: SeverityNumber.INFO,
		info: SeverityNumber.INFO,
		warn: SeverityNumber.WARN,
		error: SeverityNumber.ERROR
	};

	for (const [method, severity] of Object.entries(severityMap)) {
		console[method] = (...args) => {
			// Always call original console method
			originalConsole[method](...args);

			// Send to OTel if logger is available
			if (!otelLogger) return;

			try {
				const message = args
					.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
					.join(' ');

				// Get current span context for trace correlation
				const activeContext = context.active();
				const span = trace.getSpan(activeContext);
				const spanContext = span?.spanContext();

				otelLogger.emit({
					severityNumber: severity,
					severityText: method.toUpperCase(),
					body: message,
					timestamp: Date.now(),
					context: activeContext,
					attributes: spanContext
						? {
								trace_id: spanContext.traceId,
								span_id: spanContext.spanId
							}
						: undefined
				});
			} catch {
				// Silently ignore OTel errors to prevent infinite loops
			}
		};
	}

	consoleBridged = true;
}

export function initTelemetry(serviceName = process.env.OTEL_SERVICE_NAME || 'followthrough') {
	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

	if (!endpoint) {
		process.stdout.write('[OTel] OTEL_EXPORTER_OTLP_ENDPOINT is not set. Telemetry is disabled.\n');
		return null;
	}

	const projectName = process.env.PHOENIX_PROJECT_NAME || 'followthrough';

	process.stdout.write(
		`[OTel] Initializing telemetry for ${serviceName}. Exporting to ${endpoint}\n`
	);

	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: serviceName,
		[ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.1',
		'deployment.environment': process.env.OTEL_ENVIRONMENT || process.env.NODE_ENV || 'development',
		// Routes spans to the right Phoenix project at the collector.
		'phoenix.project': projectName,
		'openinference.project.name': projectName
	});

	// The gRPC exporters take auth as gRPC metadata, which they parse out of
	// OTEL_EXPORTER_OTLP_HEADERS — so no @grpc/grpc-js import is needed here.
	// Phoenix accepts the token under either header depending on deployment.
	if (process.env.PHOENIX_API_KEY && !process.env.OTEL_EXPORTER_OTLP_HEADERS) {
		const token = process.env.PHOENIX_API_KEY;
		process.env.OTEL_EXPORTER_OTLP_HEADERS = `authorization=Bearer ${token},api_key=${token}`;
	}

	const traceExporter = new OTLPTraceExporter({ url: endpoint });
	const logExporter = new OTLPLogExporter({ url: endpoint });

	sdk = new NodeSDK({
		resource,
		traceExporter,
		logRecordProcessors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
		instrumentations: [
			getNodeAutoInstrumentations({
				'@opentelemetry/instrumentation-fs': { enabled: false },
				'@opentelemetry/instrumentation-pg': {
					enhancedDatabaseReporting: true
				},
				'@opentelemetry/instrumentation-http': {
					enabled: true
				},
				'@opentelemetry/instrumentation-dns': { enabled: false },
				'@opentelemetry/instrumentation-net': { enabled: false }
			})
		]
	});

	sdk.start();

	// Bridge console after SDK starts (so logger provider is registered)
	bridgeConsoleLogs();

	instrumentLlmClients();

	console.log('[OTel] Telemetry initialized successfully.');
	return sdk;
}

/**
 * Bridge the LLM call paths to OpenInference spans on the SDK's tracer provider.
 *
 * The Agents SDK has its own proprietary tracing, so it needs the OpenInference
 * bridge; the inline-suggestion path (ghost text) calls the plain OpenAI SDK
 * against OpenRouter and needs the OpenAI instrumentation. Patching here, before
 * any client is constructed, covers every call on both paths.
 */
function instrumentLlmClients() {
	const tracerProvider = trace.getTracerProvider();
	try {
		new OpenAIAgentsInstrumentation({ tracerProvider }).manuallyInstrument(agents);
		new OpenAIInstrumentation({ tracerProvider }).manuallyInstrument(OpenAI);
		process.stdout.write('[OTel] OpenInference Agents & OpenAI instrumentation registered.\n');
	} catch (err) {
		process.stderr.write(`[OTel] Failed to register OpenInference instrumentation: ${err}\n`);
	}
}

export async function shutdownTelemetry() {
	try {
		if (sdk) {
			await sdk.shutdown();
		}
		process.stdout.write('[OTel] Telemetry shut down successfully.\n');
	} catch (err) {
		process.stderr.write(`[OTel] Error shutting down telemetry: ${err}\n`);
	}
}

// Auto-initialize if this file is imported and OTEL_EXPORTER_OTLP_ENDPOINT is set
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (endpoint && !globalThis.__otel_initialized__) {
	globalThis.__otel_initialized__ = true;
	initTelemetry();
	process.once('SIGTERM', () => void shutdownTelemetry());
}

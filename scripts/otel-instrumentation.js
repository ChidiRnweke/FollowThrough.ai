/**
 * OpenTelemetry + OpenInference preload for Phoenix.
 *
 * Loaded before app code via `node --import ./scripts/otel-instrumentation.js build`
 * so the OpenAI instrumentation patches the `openai` client before it is imported.
 * Modelled on TalkingCode's `talkingcode-frontend/scripts/otel-instrumentation.js`.
 *
 * Telemetry is opt-in: it initialises only when OTEL_EXPORTER_OTLP_ENDPOINT is set,
 * and otherwise no-ops. Export failures never propagate into request handling — the
 * fail-hard rule applies to config/secrets, not to trace export.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { SEMRESATTRS_PROJECT_NAME } from '@arizeai/openinference-semantic-conventions';
import { OpenAIInstrumentation } from '@arizeai/openinference-instrumentation-openai';

/** @type {NodeSDK | null} */
let sdk = null;

export function initTelemetry() {
	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!endpoint) {
		process.stdout.write('[OTel] OTEL_EXPORTER_OTLP_ENDPOINT is not set. Telemetry is disabled.\n');
		return null;
	}

	const projectName = process.env.PHOENIX_PROJECT_NAME || 'followthrough';
	process.stdout.write(
		`[OTel] Initializing telemetry for ${projectName}. Exporting to ${endpoint}\n`
	);

	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: projectName,
		[ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.1',
		[SEMRESATTRS_PROJECT_NAME]: projectName,
		'deployment.environment': process.env.OTEL_ENVIRONMENT || process.env.NODE_ENV || 'development'
	});

	// Self-hosted Phoenix behind an OTLP collector usually needs no auth; when a
	// key is provided, forward it both ways so either collector config accepts it.
	const headers = process.env.PHOENIX_API_KEY
		? {
				authorization: `Bearer ${process.env.PHOENIX_API_KEY}`,
				api_key: process.env.PHOENIX_API_KEY
			}
		: undefined;

	sdk = new NodeSDK({
		resource,
		traceExporter: new OTLPTraceExporter({ url: endpoint, headers }),
		instrumentations: [new OpenAIInstrumentation()]
	});

	sdk.start();
	process.stdout.write('[OTel] Telemetry initialized.\n');
	return sdk;
}

export async function shutdownTelemetry() {
	try {
		if (sdk) await sdk.shutdown();
	} catch (err) {
		process.stderr.write(`[OTel] Error shutting down telemetry: ${err}\n`);
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

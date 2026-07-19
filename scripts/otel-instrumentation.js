/**
 * OpenTelemetry + OpenInference preload for Phoenix.
 *
 * Loaded before app code via `node --import ./scripts/otel-instrumentation.js build`
 * so the OpenAI Agents instrumentation registers its TracingProcessor before the
 * first Runner.run() call. Mirrors the Python TalkingCode pattern:
 *   phoenix.otel.register(auto_instrument=True)
 *
 * Telemetry is opt-in: it initialises only when OTEL_EXPORTER_OTLP_ENDPOINT is set,
 * and otherwise no-ops. Export failures never propagate into request handling — the
 * fail-hard rule applies to config/secrets, not to trace export.
 */
import 'dotenv/config';
import { register } from '@arizeai/phoenix-otel';
import { OpenAIAgentsInstrumentation } from '@arizeai/openinference-instrumentation-openai-agents';
import * as agents from '@openai/agents';

/** @type {import('@opentelemetry/sdk-trace-node').NodeTracerProvider | null} */
let provider = null;

export function initTelemetry() {
	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!endpoint) {
		process.stdout.write('[OTel] OTEL_EXPORTER_OTLP_ENDPOINT is not set. Telemetry is disabled.\n');
		return null;
	}

	const projectName = process.env.PHOENIX_PROJECT_NAME || 'followthrough';
	process.stdout.write(
		`[OTel] Initializing Phoenix telemetry for ${projectName}. Exporting to ${endpoint}\n`
	);

	// register() creates a TracerProvider with OTLP export to the given endpoint,
	// stamping the phoenix.project resource attribute for collector routing.
	// It reads PHOENIX_API_KEY from env for auth headers automatically.
	provider = register({
		projectName,
		endpoint: `${endpoint.replace(/\/+$/, '')}/v1/traces`,
		headers: process.env.PHOENIX_API_KEY
			? {
					authorization: `Bearer ${process.env.PHOENIX_API_KEY}`,
					api_key: process.env.PHOENIX_API_KEY
				}
			: undefined
	});

	// Bridge the OpenAI Agents SDK's proprietary tracing to OTel/OpenInference
	// spans. By default this replaces the SDK's built-in OpenAI exporter (which
	// we don't need since we use OpenRouter, not OpenAI directly).
	const instrumentation = new OpenAIAgentsInstrumentation({ tracerProvider: provider });
	instrumentation.manuallyInstrument(agents);

	process.stdout.write('[OTel] Phoenix telemetry + Agents instrumentation initialized.\n');
	return provider;
}

export async function shutdownTelemetry() {
	try {
		if (provider) await provider.shutdown();
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

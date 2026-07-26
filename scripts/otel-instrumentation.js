/**
 * OpenTelemetry + OpenInference preload for Phoenix.
 *
 * Loaded before app code so the OpenAI Agents instrumentation registers its
 * tracing processor before the first Runner.run() call. Phoenix's register()
 * uses OTLP/HTTP, matching the local collector exposed on port 4318.
 *
 * Telemetry is opt-in: it initialises only when OTEL_EXPORTER_OTLP_ENDPOINT is
 * set. Export failures never propagate into request handling.
 */
import { register } from '@arizeai/phoenix-otel';
import { OpenAIAgentsInstrumentation } from '@arizeai/openinference-instrumentation-openai-agents';
import * as agents from '@openai/agents';

let provider = null;

export function initTelemetry() {
	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!endpoint) {
		process.stdout.write('[OTel] OTEL_EXPORTER_OTLP_ENDPOINT is not set. Telemetry is disabled.\n');
		return null;
	}

	const projectName = process.env.PHOENIX_PROJECT_NAME || 'followthrough';
	const traceEndpoint = `${endpoint.replace(/\/+$/, '')}/v1/traces`;

	process.stdout.write(
		`[OTel] Initializing Phoenix telemetry for ${projectName}. Exporting to ${traceEndpoint}\n`
	);

	provider = register({
		projectName,
		endpoint: traceEndpoint,
		headers: process.env.PHOENIX_API_KEY
			? {
					authorization: `Bearer ${process.env.PHOENIX_API_KEY}`,
					api_key: process.env.PHOENIX_API_KEY
				}
			: undefined
	});

	new OpenAIAgentsInstrumentation({ tracerProvider: provider }).manuallyInstrument(agents);

	process.stdout.write('[OTel] Phoenix telemetry + Agents instrumentation initialized.\n');
	return provider;
}

export async function shutdownTelemetry() {
	try {
		if (provider) await provider.shutdown();
		process.stdout.write('[OTel] Phoenix telemetry shut down successfully.\n');
	} catch (error) {
		process.stderr.write(`[OTel] Error shutting down telemetry: ${error}\n`);
	}
}

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT && !globalThis.__otel_initialized__) {
	globalThis.__otel_initialized__ = true;
	initTelemetry();
	process.once('SIGTERM', () => void shutdownTelemetry());
}

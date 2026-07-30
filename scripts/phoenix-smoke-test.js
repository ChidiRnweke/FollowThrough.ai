import 'dotenv/config';
import { createClient } from '@arizeai/phoenix-client';
import { getSpans } from '@arizeai/phoenix-client/spans';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (!endpoint) throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT is not set.');

if (!process.env.PHOENIX_HOST && process.env.PHOENIX_BASE_URL)
	process.env.PHOENIX_HOST = process.env.PHOENIX_BASE_URL;

const projectName = process.env.PHOENIX_PROJECT_NAME ?? 'followthrough-dev';
const marker = `phoenix-smoke-${crypto.randomUUID()}`;
const startedAt = new Date();

process.stdout.write(`[Phoenix smoke] Emitting ${marker} to ${projectName} through ${endpoint}\n`);

const { shutdownTelemetry } = await import('./otel-instrumentation.js');
const { traceOperation, traceWorkflow } = await import('../src/lib/server/services/telemetry.ts');

await traceWorkflow(
	'diagnostic.phoenix-smoke',
	{
		input: marker,
		metadata: { marker, source: 'scripts/phoenix-smoke-test.js' },
		tags: ['diagnostic', 'smoke-test']
	},
	() =>
		traceOperation(
			'diagnostic.phoenix-smoke.child',
			{ input: marker },
			async () => ({ marker }),
			(result) => JSON.stringify(result)
		),
	(result) => JSON.stringify(result)
);

// Provider shutdown force-flushes its processors before returning.
await shutdownTelemetry();

const client = createClient();
const project = { projectName };
const attempts = 10;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
	const page = await getSpans({
		client,
		project,
		startTime: startedAt,
		limit: 100
	});
	const emitted = page.spans.filter(
		(span) =>
			span.name === 'diagnostic.phoenix-smoke' && span.attributes?.['input.value'] === marker
	);

	if (emitted.length > 0) {
		const span = emitted[0];
		process.stdout.write(
			`[Phoenix smoke] Confirmed trace ${span.context.trace_id} in ${projectName}.\n`
		);
		process.exit(0);
	}

	if (attempt < attempts) await Bun.sleep(1_000);
}

throw new Error(
	`Phoenix did not return ${marker} after ${attempts} attempts. The SDK created and flushed the spans, but the collector/export path did not deliver them.`
);

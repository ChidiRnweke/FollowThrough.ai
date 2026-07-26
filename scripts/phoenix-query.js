import 'dotenv/config';
import { createClient } from '@arizeai/phoenix-client';
import { getSpans } from '@arizeai/phoenix-client/spans';

const usage = `Usage:
  bun scripts/phoenix-query.js --trace-id <32-hex-id> [--raw]
  bun scripts/phoenix-query.js --days <positive-number> [--raw]`;

const fail = (message) => {
	process.stderr.write(`${message}\n\n${usage}\n`);
	process.exit(1);
};

const args = process.argv.slice(2);
if (args.includes('--help')) {
	process.stdout.write(`${usage}\n`);
	process.exit(0);
}

let raw = false;
let traceId;
let daysValue;
for (let index = 0; index < args.length; index += 1) {
	const argument = args[index];
	if (argument === '--raw') {
		raw = true;
		continue;
	}
	if (argument !== '--trace-id' && argument !== '--days') fail(`Unknown argument: ${argument}`);
	const value = args[index + 1];
	if (!value || value.startsWith('--')) fail(`Missing value for ${argument}.`);
	if (argument === '--trace-id') {
		if (traceId !== undefined) fail('--trace-id may be provided only once.');
		traceId = value;
	} else {
		if (daysValue !== undefined) fail('--days may be provided only once.');
		daysValue = value;
	}
	index += 1;
}

if (Boolean(traceId) === Boolean(daysValue)) fail('Provide exactly one of --trace-id or --days.');
if (traceId && !/^[0-9a-f]{32}$/i.test(traceId))
	fail('--trace-id must be exactly 32 hexadecimal characters.');

const days = daysValue === undefined ? undefined : Number(daysValue);
if (days !== undefined && (!Number.isFinite(days) || days <= 0))
	fail('--days must be a positive number.');

if (!process.env.PHOENIX_HOST && process.env.PHOENIX_BASE_URL)
	process.env.PHOENIX_HOST = process.env.PHOENIX_BASE_URL;
if (!process.env.PHOENIX_HOST)
	fail('PHOENIX_HOST or PHOENIX_BASE_URL must identify the Phoenix server.');

const projectName = process.env.PHOENIX_PROJECT_NAME ?? 'followthrough-dev';
const startTime = days === undefined ? undefined : new Date(Date.now() - days * 86_400_000);
const client = createClient();
const project = { projectName };
const spans = [];
let cursor;
try {
	do {
		const page = await getSpans({
			client,
			project,
			limit: 1_000,
			...(traceId ? { traceIds: [traceId] } : { startTime }),
			...(cursor ? { cursor } : {})
		});
		spans.push(...page.spans);
		cursor = page.nextCursor ?? undefined;
	} while (cursor);
} catch (error) {
	process.stderr.write(
		`Phoenix query failed: ${error instanceof Error ? error.message : String(error)}\n`
	);
	process.exit(1);
}

if (traceId && spans.length === 0) {
	process.stderr.write(`Trace ${traceId} was not found in Phoenix project ${projectName}.\n`);
	process.exit(1);
}

if (raw) {
	process.stdout.write(`${JSON.stringify(spans, null, 2)}\n`);
	process.exit(0);
}

const instant = (value) => {
	const milliseconds = typeof value === 'string' ? Date.parse(value) : Number.NaN;
	return Number.isNaN(milliseconds) ? undefined : milliseconds;
};

const compactValue = (value) => {
	if (typeof value !== 'string' || value.length <= 240) return value;
	return { preview: value.slice(0, 240), length: value.length, truncated: true };
};

const noisyAttribute = (key) =>
	key.includes('embedding.embeddings') ||
	key.includes('embedding.vector') ||
	key.startsWith('llm.input_messages') ||
	key.startsWith('llm.output_messages') ||
	key === 'llm.invocation_parameters' ||
	key.startsWith('llm.tools');

const diagnosticAttribute = (key, includePayload) =>
	/(^|\.)(tool|error|exception|token)(\.|$)/i.test(key) ||
	key === 'session.id' ||
	(includePayload && (key === 'input.value' || key === 'output.value'));

const compactAttributes = (attributes = {}, includePayload = false) =>
	Object.fromEntries(
		Object.entries(attributes)
			.filter(([key]) => diagnosticAttribute(key, includePayload) && !noisyAttribute(key))
			.map(([key, value]) => [key, compactValue(value)])
	);

const payloadSizes = (attributes = {}) => {
	const size = (value) =>
		typeof value === 'string'
			? value.length
			: value === undefined
				? undefined
				: JSON.stringify(value).length;
	const input = size(attributes['input.value']);
	const output = size(attributes['output.value']);
	return input === undefined && output === undefined ? undefined : { input, output };
};

const chronological = [...spans].sort(
	(left, right) => (instant(left.start_time) ?? 0) - (instant(right.start_time) ?? 0)
);
const byTrace = Map.groupBy(chronological, (span) => span.context.trace_id);
const traces = [...byTrace].map(([id, traceSpans]) => {
	const starts = traceSpans.map((span) => instant(span.start_time)).filter(Number.isFinite);
	const ends = traceSpans.map((span) => instant(span.end_time)).filter(Number.isFinite);
	const startedAt = starts.length > 0 ? Math.min(...starts) : undefined;
	const endedAt = ends.length > 0 ? Math.max(...ends) : undefined;
	return {
		traceId: id,
		startTime: startedAt === undefined ? undefined : new Date(startedAt).toISOString(),
		endTime: endedAt === undefined ? undefined : new Date(endedAt).toISOString(),
		durationMs: startedAt === undefined || endedAt === undefined ? undefined : endedAt - startedAt,
		spans: traceSpans.map((span) => {
			const spanStart = instant(span.start_time);
			const spanEnd = instant(span.end_time);
			const hasException = (span.events ?? []).some((event) => event.name === 'exception');
			const includePayload =
				span.span_kind === 'TOOL' || span.status_code === 'ERROR' || hasException;
			const sizes = payloadSizes(span.attributes);
			const diagnostics = compactAttributes(span.attributes, includePayload);
			const events = (span.events ?? []).map((event) => ({
				name: event.name,
				timestamp: event.timestamp,
				attributes: compactAttributes(event.attributes)
			}));
			return {
				name: span.name,
				spanId: span.context.span_id,
				parentId: span.parent_id ?? undefined,
				kind: span.span_kind,
				status: span.status_code,
				statusMessage: span.status_message || undefined,
				startTime: span.start_time,
				endTime: span.end_time,
				durationMs:
					spanStart === undefined || spanEnd === undefined ? undefined : spanEnd - spanStart,
				...(sizes ? { payloadSizes: sizes } : {}),
				...(Object.keys(diagnostics).length > 0 ? { diagnostics } : {}),
				...(events.length > 0 ? { events } : {})
			};
		})
	};
});

process.stdout.write(
	`${JSON.stringify(
		{
			project: projectName,
			query: traceId ? { traceId } : { days, startTime: startTime.toISOString() },
			counts: { traces: traces.length, spans: spans.length },
			traces
		},
		null,
		2
	)}\n`
);

import 'dotenv/config';
import { createClient } from '@arizeai/phoenix-client';
import { getSpans } from '@arizeai/phoenix-client/spans';

const argument = (name) => {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
};

const sinceValue = argument('--since');
const since = sinceValue ? new Date(sinceValue) : new Date(Date.now() - 24 * 60 * 60 * 1000);
if (Number.isNaN(since.getTime())) throw new Error(`Invalid --since value: ${sinceValue}`);

if (!process.env.PHOENIX_HOST && process.env.PHOENIX_BASE_URL)
	process.env.PHOENIX_HOST = process.env.PHOENIX_BASE_URL;

const projectName = process.env.PHOENIX_PROJECT_NAME ?? 'followthrough-dev';
const client = createClient();
const project = { projectName };

const spans = [];
let cursor;
do {
	const page = await getSpans({
		client,
		project,
		startTime: since,
		limit: 1_000,
		...(cursor ? { cursor } : {})
	});
	spans.push(...page.spans);
	cursor = page.nextCursor ?? undefined;
} while (cursor);

const histogram = (values) =>
	Object.fromEntries(
		[
			...values.reduce(
				(counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1),
				new Map()
			)
		].sort((left, right) => right[1] - left[1])
	);

const spansByTrace = Map.groupBy(spans, (span) => span.context.trace_id);
const roots = spans.filter((span) => !span.parent_id);
const providerNames = new Set(['OpenAI Embeddings', 'OpenAI Chat Completions', 'OpenAI Responses']);
const providerRoots = roots.filter((span) => providerNames.has(span.name));
const genericProviderSpans = spans.filter((span) => providerNames.has(span.name));
const standaloneEmbeddingRoots = roots.filter((span) => span.name === 'embedding.batch');
const splitInlineRoots = roots.filter(
	(span) => span.name === 'inline.context' || span.name === 'inline.complete'
);
const inlineSessionRoots = roots.filter(
	(span) => span.name.startsWith('inline.') && typeof span.attributes?.['session.id'] === 'string'
);
const unresolvedParents = spans.filter((span) => {
	if (!span.parent_id) return false;
	const traceSpans = spansByTrace.get(span.context.trace_id) ?? [];
	return !traceSpans.some((candidate) => candidate.context.span_id === span.parent_id);
});
const duplicateAgentLlmTraces = [...spansByTrace].filter(([, traceSpans]) => {
	const hasAgentsGeneration = traceSpans.some(
		(span) => span.span_kind === 'LLM' && (span.name === 'generation' || span.name === 'response')
	);
	const hasGenericProvider = traceSpans.some(
		(span) => span.span_kind === 'LLM' && providerNames.has(span.name)
	);
	return hasAgentsGeneration && hasGenericProvider;
});
const sessionRootCounts = roots.reduce((counts, span) => {
	const sessionId = span.attributes?.['session.id'];
	if (typeof sessionId === 'string') counts.set(sessionId, (counts.get(sessionId) ?? 0) + 1);
	return counts;
}, new Map());
const oversizedSessions = [...sessionRootCounts].filter(([, count]) => count > 50);

const report = {
	project: projectName,
	since: since.toISOString(),
	counts: {
		traces: spansByTrace.size,
		spans: spans.length,
		roots: roots.length
	},
	rootNames: histogram(roots.map((span) => span.name)),
	spanKinds: histogram(spans.map((span) => span.span_kind)),
	violations: {
		providerRoots: providerRoots.map((span) => span.context.trace_id),
		genericProviderSpans: genericProviderSpans.map((span) => span.context.span_id),
		standaloneEmbeddingRoots: standaloneEmbeddingRoots.map((span) => span.context.trace_id),
		splitInlineRoots: splitInlineRoots.map((span) => span.context.trace_id),
		inlineSessionRoots: inlineSessionRoots.map((span) => span.context.trace_id),
		unresolvedParents: unresolvedParents.map((span) => span.context.span_id),
		duplicateAgentLlmTraces: duplicateAgentLlmTraces.map(([traceId]) => traceId),
		oversizedSessions: oversizedSessions.map(([sessionId, count]) => ({ sessionId, count }))
	}
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

const violationCount = Object.values(report.violations).reduce(
	(total, violations) => total + violations.length,
	0
);
if (violationCount > 0) process.exitCode = 1;

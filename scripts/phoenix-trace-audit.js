import 'dotenv/config';
import { createClient } from '@arizeai/phoenix-client';
import { getSpans } from '@arizeai/phoenix-client/spans';
import { MimeType, SemanticConventions } from '@arizeai/openinference-semantic-conventions';

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
const malformedRerankerSpans = spans.filter((span) => {
	if (span.span_kind !== 'RERANKER') return false;
	const attributes = span.attributes ?? {};
	const keys = Object.keys(attributes);
	return (
		attributes[SemanticConventions.INPUT_MIME_TYPE] !== MimeType.JSON ||
		attributes[SemanticConventions.OUTPUT_MIME_TYPE] !== MimeType.JSON ||
		typeof attributes[SemanticConventions.RERANKER_QUERY] !== 'string' ||
		typeof attributes[SemanticConventions.RERANKER_MODEL_NAME] !== 'string' ||
		typeof attributes[SemanticConventions.RERANKER_TOP_K] !== 'number' ||
		!keys.some((key) => key.startsWith(`${SemanticConventions.RERANKER_INPUT_DOCUMENTS}.`)) ||
		!keys.some((key) => key.startsWith(`${SemanticConventions.RERANKER_OUTPUT_DOCUMENTS}.`))
	);
});
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

// A run that parks on an approval (or is otherwise abandoned mid-turn) leaves the
// SDK agent span open, so the trace exports as either a bare `agent.turn` +
// `Agent workflow` pair (children silently dropped) or with generation/tool spans
// orphaned beneath a parent that was never exported. Both are the same bug: the
// accepted tools "become traces" because they detach from the agent.
const sdkToolNames = new Set(['use_tool', 'search_tools', 'get_note', 'get_workspace_context']);
const agentTurnRoots = new Set(['agent.turn', 'diagram.agent-turn']);
const splitAgentTraces = [...spansByTrace].filter(([, traceSpans]) => {
	const root = traceSpans.find((span) => !span.parent_id);
	if (!root || !agentTurnRoots.has(root.name)) return false;
	const hasWorkflow = traceSpans.some((span) => span.name === 'Agent workflow');
	const traceSpanIds = new Set(traceSpans.map((span) => span.context.span_id));
	const orphaned = traceSpans.some((span) => span.parent_id && !traceSpanIds.has(span.parent_id));
	const hasSdkActivity = traceSpans.some(
		(span) => span.name === 'generation' || span.span_kind === 'TOOL' || sdkToolNames.has(span.name)
	);
	return hasWorkflow && (orphaned || !hasSdkActivity);
});

// A resumed run reconstructs its agent span from serialized state without
// starting it, so the OpenInference processor holds no span for it and the
// generation/tool spans beneath re-parent to the `agent.turn` root instead. The
// trace still looks well-formed — every parent resolves — which is why
// `splitAgentTraces` above misses it. The tell is an LLM or TOOL span sitting
// directly under the turn root while an `Agent workflow` span exists as a leaf.
const misparentedAgentChildren = spans.filter((span) => {
	if (span.span_kind !== 'LLM' && span.span_kind !== 'TOOL') return false;
	const traceSpans = spansByTrace.get(span.context.trace_id) ?? [];
	const root = traceSpans.find((candidate) => !candidate.parent_id);
	if (!root || !agentTurnRoots.has(root.name) || span.parent_id !== root.context.span_id)
		return false;
	return traceSpans.some((candidate) => candidate.name === 'Agent workflow');
});

// One user request is one run is one trace. A run spread over several traces
// means something re-executed it — an approval resume that opened a new root —
// and the reader has to stitch the turns back together by hand.
const runTraces = spans.reduce((runs, span) => {
	const runId = span.attributes?.['metadata.runId'];
	if (typeof runId !== 'string') return runs;
	const traces = runs.get(runId) ?? new Set();
	traces.add(span.context.trace_id);
	return runs.set(runId, traces);
}, new Map());
const splitRunTraces = [...runTraces].filter(([, traces]) => traces.size > 1);

// A base64 image replayed into `input.value` on every turn is the usual cause;
// it costs collector bandwidth and makes the trace unreadable in the UI.
const MAX_PAYLOAD_CHARS = 64 * 1024;
const oversizedSpanPayloads = spans.filter((span) =>
	['input.value', 'output.value'].some((key) => {
		const value = span.attributes?.[key];
		return typeof value === 'string' && value.length > MAX_PAYLOAD_CHARS;
	})
);

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
		malformedRerankerSpans: malformedRerankerSpans.map((span) => span.context.span_id),
		standaloneEmbeddingRoots: standaloneEmbeddingRoots.map((span) => span.context.trace_id),
		splitInlineRoots: splitInlineRoots.map((span) => span.context.trace_id),
		inlineSessionRoots: inlineSessionRoots.map((span) => span.context.trace_id),
		unresolvedParents: unresolvedParents.map((span) => span.context.span_id),
		duplicateAgentLlmTraces: duplicateAgentLlmTraces.map(([traceId]) => traceId),
		splitAgentTraces: splitAgentTraces.map(([traceId]) => traceId),
		misparentedAgentChildren: misparentedAgentChildren.map((span) => span.context.span_id),
		splitRunTraces: splitRunTraces.map(([runId, traces]) => ({ runId, traces: traces.size })),
		oversizedSpanPayloads: oversizedSpanPayloads.map((span) => span.context.span_id),
		oversizedSessions: oversizedSessions.map(([sessionId, count]) => ({ sessionId, count }))
	}
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

const violationCount = Object.values(report.violations).reduce(
	(total, violations) => total + violations.length,
	0
);
if (violationCount > 0) process.exitCode = 1;

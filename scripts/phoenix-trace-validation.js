import 'dotenv/config';
import { createClient } from '@arizeai/phoenix-client';
import { getSpans } from '@arizeai/phoenix-client/spans';
import {
	MimeType,
	OpenInferenceSpanKind,
	SemanticConventions
} from '@arizeai/openinference-semantic-conventions';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (!endpoint) throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT is not set.');

if (!process.env.PHOENIX_HOST && process.env.PHOENIX_BASE_URL)
	process.env.PHOENIX_HOST = process.env.PHOENIX_BASE_URL;

const projectName = process.env.PHOENIX_PROJECT_NAME ?? 'followthrough-dev';
const marker = `phoenix-validation-${crypto.randomUUID()}`;
const query = `validation query ${marker}`;
const startedAt = new Date();
const providerNames = new Set(['OpenAI Embeddings', 'OpenAI Chat Completions', 'OpenAI Responses']);

const match = {
	document: {
		id: `validation-document-${marker}`,
		sourceTitle: 'Telemetry validation',
		sectionPath: 'Reranking',
		content: 'Phoenix should receive structured reranker documents.'
	},
	score: 0.93
};

const assertInvariant = (condition, message) => {
	if (!condition) throw new Error(`[Phoenix validation] ${message}`);
};

const findSpan = (spans, name) => spans.find((span) => span.name === name);
const isChildOf = (child, parent) =>
	Boolean(child && parent && child.parent_id === parent.context.span_id);

process.stdout.write(
	`[Phoenix validation] Emitting ${marker} to ${projectName} through ${endpoint}\n`
);

const { shutdownTelemetry } = await import('./otel-instrumentation.js');
const { traceOperation, traceWorkflow } = await import('../src/lib/server/services/telemetry.ts');
const { rerankerInputTraceAttributes, rerankerOutputTraceAttributes } =
	await import('../src/lib/server/services/retrieval/ranking.ts');

await traceWorkflow(
	'inline.suggestion',
	{
		input: marker,
		metadata: { marker, source: 'scripts/phoenix-trace-validation.js' },
		tags: ['diagnostic', 'trace-validation']
	},
	async () => {
		await traceOperation('inline.context', { input: query }, async () => {
			await traceOperation(
				'retrieval.vector-search',
				{ input: query, kind: OpenInferenceSpanKind.RETRIEVER },
				() =>
					traceOperation(
						'embedding.batch',
						{
							input: JSON.stringify([query]),
							inputMimeType: MimeType.JSON,
							outputMimeType: MimeType.JSON,
							kind: OpenInferenceSpanKind.EMBEDDING,
							onlyWithinWorkflow: true
						},
						async () => ({ model: 'validation-embedding', vectorCount: 1 }),
						(result) => JSON.stringify(result)
					),
				() => JSON.stringify({ matchCount: 1 })
			);

			await traceOperation(
				'retrieval.rerank',
				{
					input: JSON.stringify({ query, documents: [match.document] }),
					inputMimeType: MimeType.JSON,
					outputMimeType: MimeType.JSON,
					kind: OpenInferenceSpanKind.RERANKER,
					attributes: rerankerInputTraceAttributes(query, [match], 'validation-reranker', 1)
				},
				async () => [match],
				(results) =>
					JSON.stringify({
						results: results.map((result) => ({
							documentId: result.document.id,
							score: result.score
						}))
					}),
				rerankerOutputTraceAttributes
			);
		});

		await traceOperation(
			'inline.generate',
			{ input: query, kind: OpenInferenceSpanKind.LLM },
			async () => 'validated suggestion',
			(result) => result
		);

		return 'validated suggestion';
	},
	(result) => result
);

await shutdownTelemetry();

const client = createClient();
const project = { projectName };
const attempts = 10;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
	const page = await getSpans({ client, project, startTime: startedAt, limit: 100 });
	const root = page.spans.find(
		(span) => span.name === 'inline.suggestion' && span.attributes?.['input.value'] === marker
	);
	if (!root) {
		if (attempt < attempts) {
			await Bun.sleep(1_000);
			continue;
		}
		break;
	}

	const traceSpans = page.spans.filter((span) => span.context.trace_id === root.context.trace_id);
	const contextSpan = findSpan(traceSpans, 'inline.context');
	const retrievalSpan = findSpan(traceSpans, 'retrieval.vector-search');
	const embeddingSpan = findSpan(traceSpans, 'embedding.batch');
	const rerankerSpan = findSpan(traceSpans, 'retrieval.rerank');
	const generationSpan = findSpan(traceSpans, 'inline.generate');
	const rerankerAttributes = rerankerSpan?.attributes ?? {};
	const rerankerKeys = Object.keys(rerankerAttributes);

	assertInvariant(!root.parent_id, 'inline.suggestion must be the sole trace root.');
	assertInvariant(isChildOf(contextSpan, root), 'inline.context must be nested under the root.');
	assertInvariant(
		isChildOf(retrievalSpan, contextSpan),
		'retrieval.vector-search must be nested under inline.context.'
	);
	assertInvariant(
		isChildOf(embeddingSpan, retrievalSpan),
		'embedding.batch must be nested under retrieval.vector-search.'
	);
	assertInvariant(
		isChildOf(rerankerSpan, contextSpan),
		'retrieval.rerank must be nested under inline.context.'
	);
	assertInvariant(
		isChildOf(generationSpan, root),
		'inline.generate must be nested under the root.'
	);
	assertInvariant(
		rerankerAttributes[SemanticConventions.INPUT_MIME_TYPE] === MimeType.JSON,
		'reranker input must be application/json.'
	);
	assertInvariant(
		rerankerAttributes[SemanticConventions.OUTPUT_MIME_TYPE] === MimeType.JSON,
		'reranker output must be application/json.'
	);
	assertInvariant(
		rerankerAttributes[SemanticConventions.RERANKER_QUERY] === query,
		'reranker query semantic attribute is missing.'
	);
	assertInvariant(
		rerankerAttributes[SemanticConventions.RERANKER_MODEL_NAME] === 'validation-reranker',
		'reranker model semantic attribute is missing.'
	);
	assertInvariant(
		rerankerKeys.some((key) => key.startsWith(`${SemanticConventions.RERANKER_INPUT_DOCUMENTS}.`)),
		'reranker input documents are missing.'
	);
	assertInvariant(
		rerankerKeys.some((key) => key.startsWith(`${SemanticConventions.RERANKER_OUTPUT_DOCUMENTS}.`)),
		'reranker output documents are missing.'
	);
	assertInvariant(
		!traceSpans.some((span) => providerNames.has(span.name)),
		'generic OpenAI provider spans must not appear.'
	);

	process.stdout.write(
		`[Phoenix validation] Confirmed trace ${root.context.trace_id}: ${traceSpans
			.map((span) => span.name)
			.sort()
			.join(', ')}\n`
	);
	process.exit(0);
}

throw new Error(
	`Phoenix did not return ${marker} after ${attempts} attempts. The SDK created and flushed the spans, but the collector/export path did not deliver them.`
);

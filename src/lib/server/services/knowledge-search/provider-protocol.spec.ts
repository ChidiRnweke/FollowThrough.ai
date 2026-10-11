import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { APIUserAbortError } from 'openai';
import type { ConversationId, Message, StoredMessage } from '$lib/models/agent';
import type { SearchMatch } from '$lib/models/knowledge-search';
import type { OperationObserver, WorkflowTraceContext } from '$lib/models/telemetry';
import type { Attributes } from '@opentelemetry/api';
import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import { createRetrievalProvider } from '$lib/server/factories/retrieval-providers';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { rerankProvider } from '$lib/testing/knowledge-search/fixtures/rerank-provider';
import { inlineCompletionProvider } from '$lib/testing/inline-suggestions/fixtures/provider';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { KnowledgeRetrieval } from './retrieval';

const direct: OperationObserver = { run: (_name, _context, body) => body() };

/** The service over the production provider construction, pointed at a local protocol peer. */
const retrieval = (
	baseURL: string,
	observer: OperationObserver = direct,
	repository = new InMemorySearchRepository()
) => {
	const provider = createRetrievalProvider({
		apiKey: 'synthetic-key',
		baseURL,
		appURL: 'https://app.example.test'
	});
	return new KnowledgeRetrieval({
		repository,
		provider: provider.client,
		rerank: provider.rerank,
		models: { embedding: 'custom/embed', query: 'custom/query' },
		encoding: testTokenizer,
		chunking: { targetTokens: 2400, overlapTokens: 480 },
		defer: false,
		observer
	});
};

const encoded = (vector: readonly number[]) =>
	Buffer.from(new Float32Array(vector).buffer).toString('base64');
const embeddingsResponse = (
	data: readonly { readonly index: number; readonly embedding: readonly number[] }[]
) =>
	JSON.stringify({
		data: data.map((item) => ({ index: item.index, embedding: encoded(item.embedding) }))
	});

/** A source with three pending chunks, whose embedding order the provider controls. */
const pendingSource = async () => {
	const repository = new InMemorySearchRepository();
	const source = { kind: 'note' as const, noteId: testNoteId(2) };
	await repository.stage(
		testActor(),
		source,
		['a', 'b', 'c'].map((content, chunkIndex) =>
			searchDocumentBuilder({
				noteId: testNoteId(2),
				sourceTitle: 'Decisions',
				content,
				chunkIndex,
				embedding: undefined,
				embeddingModel: undefined
			})
		)
	);
	return { repository, source };
};

const matches: readonly SearchMatch[] = [
	{
		document: searchDocumentBuilder({
			sourceTitle: 'Runbook',
			sectionPath: 'Recovery',
			content: 'alpha\nbeta'
		}),
		score: 0.7
	},
	{
		document: searchDocumentBuilder({ sourceTitle: '', sectionPath: '', content: 'gamma' }),
		score: 0.6
	},
	{ document: searchDocumentBuilder({ content: 'delta' }), score: 0.5 }
];

describe('embedding protocol', () => {
	it('sends the configured model and factory headers through the real SDK', async () => {
		const provider = await inlineCompletionProvider(
			embeddingsResponse([{ index: 0, embedding: [0.25, 0.5] }])
		);
		try {
			await retrieval(provider.baseURL).candidates(testActor(), 'source', { limit: 5 });
			expect(provider.requests).toEqual([
				{
					method: 'POST',
					url: '/v1/embeddings',
					authorization: 'Bearer synthetic-key',
					referer: 'https://app.example.test',
					title: 'FollowThrough',
					contentType: 'application/json',
					body: JSON.stringify({
						model: 'custom/embed',
						input: ['source'],
						encoding_format: 'base64'
					})
				}
			]);
		} finally {
			await provider.close();
		}
	});

	it('pairs vectors with inputs by provider index regardless of arrival order', async () => {
		const provider = await inlineCompletionProvider(
			embeddingsResponse([
				{ index: 1, embedding: [1] },
				{ index: 0, embedding: [0] },
				{ index: 2, embedding: [2] }
			])
		);
		try {
			const { repository, source } = await pendingSource();
			const embedded = await retrieval(provider.baseURL, direct, repository).embedPending(
				testActor(),
				source
			);
			expect(embedded.chunks.map((chunk) => chunk.embedding)).toEqual([[0], [1], [2]]);
		} finally {
			await provider.close();
		}
	});

	it.each([
		{
			name: 'duplicate indexes',
			data: [
				{ index: 0, embedding: [1] },
				{ index: 0, embedding: [2] },
				{ index: 1, embedding: [3] }
			]
		},
		{
			name: 'an index outside the inputs',
			data: [
				{ index: 0, embedding: [1] },
				{ index: 1, embedding: [2] },
				{ index: 3, embedding: [3] }
			]
		},
		{ name: 'too few vectors', data: [{ index: 0, embedding: [1] }] }
	])('rejects $name instead of pairing vectors with the wrong input', async ({ data }) => {
		const provider = await inlineCompletionProvider(embeddingsResponse(data));
		try {
			const { repository, source } = await pendingSource();
			await expect(
				retrieval(provider.baseURL, direct, repository).embedPending(testActor(), source)
			).rejects.toMatchObject({ code: 'INVALID_GENERATED_CONTENT' });
		} finally {
			await provider.close();
		}
	});

	it('wraps a provider failure as an external service error', async () => {
		const provider = await rerankProvider('{}', 400);
		try {
			await expect(
				retrieval(provider.baseURL).candidates(testActor(), 'source', { limit: 5 })
			).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE', message: 'Embedding generation failed' });
		} finally {
			await provider.close();
		}
	});

	it('makes no request or span when nothing is pending', async () => {
		const provider = await inlineCompletionProvider(embeddingsResponse([]));
		const spans: string[] = [];
		const run: OperationObserver['run'] = async (name, _context, body) => {
			spans.push(name);
			return body();
		};
		try {
			const embedded = await retrieval(provider.baseURL, { run }).embedPending(testActor(), {
				kind: 'note',
				noteId: testNoteId(2)
			});
			expect({ chunks: embedded.chunks, requests: provider.requests, spans }).toEqual({
				chunks: [],
				requests: [],
				spans: []
			});
		} finally {
			await provider.close();
		}
	});

	it('records one embedding span with the input and result summary', async () => {
		const provider = await inlineCompletionProvider(
			embeddingsResponse([{ index: 0, embedding: [0.25, 0.5] }])
		);
		const spans: { name: string; context: WorkflowTraceContext; output: string | undefined }[] = [];
		const run: OperationObserver['run'] = async (name, context, body, output) => {
			const result = await body();
			spans.push({ name, context, output: output?.(result) });
			return result;
		};
		try {
			await retrieval(provider.baseURL, { run }).candidates(testActor(), 'source', { limit: 5 });
			expect(spans).toEqual([
				{
					name: 'embedding.batch',
					context: {
						input: '["source"]',
						inputMimeType: 'application/json',
						outputMimeType: 'application/json',
						kind: 'EMBEDDING',
						metadata: { model: 'custom/embed', inputCount: 1 },
						tags: ['embedding'],
						attributes: { 'embedding.model_name': 'custom/embed' },
						onlyWithinWorkflow: true
					},
					output: '{"model":"custom/embed","vectorCount":1}'
				}
			]);
		} finally {
			await provider.close();
		}
	});

	it('preserves SDK cancellation instead of wrapping it as a provider failure', async () => {
		const response = Promise.withResolvers<string>();
		const provider = await inlineCompletionProvider(response.promise);
		const cancellation = new AbortController();
		try {
			const pending = retrieval(provider.baseURL).candidates(testActor(), 'source', {
				limit: 5,
				signal: cancellation.signal
			});
			const assertion = expect(pending).rejects.toBeInstanceOf(APIUserAbortError);
			await provider.received;
			cancellation.abort();
			await assertion;
		} finally {
			response.resolve(embeddingsResponse([{ index: 0, embedding: [1] }]));
			await provider.close();
		}
	});
});

describe('rerank protocol', () => {
	it('sends the original query and exact structured documents with a capped result count', async () => {
		const provider = await rerankProvider('{"results":[]}');
		try {
			await retrieval(provider.baseURL).rank('  recover?  ', matches.slice(0, 2), 8);
			expect(provider.requests).toEqual([
				{
					method: 'POST',
					url: '/v1/rerank',
					authorization: 'Bearer synthetic-key',
					referer: 'https://app.example.test',
					title: 'FollowThrough',
					contentType: 'application/json',
					body: JSON.stringify({
						model: 'cohere/rerank-4-fast',
						query: '  recover?  ',
						documents: [
							'Title: "Runbook"\nSection: "Recovery"\nContent: |-\n  alpha\n  beta',
							'Content: |-\n  gamma'
						],
						top_n: 2
					})
				}
			]);
		} finally {
			await provider.close();
		}
	});

	it('keeps provider order and score precedence while ignoring indexes outside the candidates', async () => {
		const provider = await rerankProvider(
			'{"results":[{"index":2,"relevance_score":0.9,"relevanceScore":0.1},{"index":0,"relevanceScore":0.8},{"index":1},{"index":30}]}'
		);
		try {
			expect(await retrieval(provider.baseURL).rank('recover', matches, 3)).toEqual([
				{ document: matches[2].document, score: 0.9 },
				{ document: matches[0].document, score: 0.8 },
				matches[1]
			]);
		} finally {
			await provider.close();
		}
	});

	it.each([
		{ name: 'an HTTP failure', status: 503, body: '{}' },
		{ name: 'invalid JSON', status: 200, body: '{' },
		{ name: 'an invalid result shape', status: 200, body: '{"results":[{"index":-1}]}' }
	])(
		'keeps vector order after $name and leaves the failure on the rerank span',
		async ({ status, body }) => {
			const provider = await rerankProvider(body, status);
			const failures: { name: string; message: string }[] = [];
			const run: OperationObserver['run'] = async (name, _context, work) => {
				try {
					return await work();
				} catch (error) {
					failures.push({ name, message: error instanceof Error ? error.message : String(error) });
					throw error;
				}
			};
			try {
				const ranked = await retrieval(provider.baseURL, { run }).rank('recover', matches, 2);
				expect({ ranked, failures: failures.map((failure) => failure.name) }).toEqual({
					ranked: matches.slice(0, 2),
					failures: ['retrieval.rerank']
				});
			} finally {
				await provider.close();
			}
		}
	);

	it('returns empty input without a request or trace', async () => {
		const provider = await rerankProvider('{"results":[]}');
		const spans: string[] = [];
		const run: OperationObserver['run'] = async (name, _context, body) => {
			spans.push(name);
			return body();
		};
		try {
			const result = await retrieval(provider.baseURL, { run }).rank('recover', [], 2);
			expect({ result, requests: provider.requests, spans }).toEqual({
				result: [],
				requests: [],
				spans: []
			});
		} finally {
			await provider.close();
		}
	});

	it('preserves cancellation during a pending HTTP request', async () => {
		const received = Promise.withResolvers<void>();
		const server = createServer(() => received.resolve());
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('Rerank server did not bind');
		try {
			const controller = new AbortController();
			const reason = new Error('User cancelled reranking');
			const pending = retrieval(`http://127.0.0.1:${address.port}`).rank(
				'recover',
				matches,
				2,
				controller.signal
			);
			const assertion = expect(pending).rejects.toBe(reason);
			await received.promise;
			controller.abort(reason);
			await assertion;
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});

	it('records one reranker span with scored output and unscored input documents', async () => {
		const provider = await rerankProvider('{"results":[{"index":1,"relevance_score":0.95}]}');
		const spans: {
			name: string;
			context: WorkflowTraceContext;
			output: string | undefined;
			attributes: Attributes | undefined;
		}[] = [];
		const run: OperationObserver['run'] = async (name, context, body, output, attributes) => {
			const result = await body();
			spans.push({ name, context, output: output?.(result), attributes: attributes?.(result) });
			return result;
		};
		try {
			await retrieval(provider.baseURL, { run }).rank('recover', matches, 8);
			expect({
				count: spans.length,
				name: spans[0]?.name,
				kind: spans[0]?.context.kind,
				metadata: spans[0]?.context.metadata,
				inputScore:
					spans[0]?.context.attributes?.[
						`${SemanticConventions.RERANKER_INPUT_DOCUMENTS}.0.${SemanticConventions.DOCUMENT_SCORE}`
					],
				topK: spans[0]?.context.attributes?.[SemanticConventions.RERANKER_TOP_K],
				outputScore:
					spans[0]?.attributes?.[
						`${SemanticConventions.RERANKER_OUTPUT_DOCUMENTS}.0.${SemanticConventions.DOCUMENT_SCORE}`
					],
				output: JSON.parse(spans[0]!.output!)
			}).toEqual({
				count: 1,
				name: 'retrieval.rerank',
				kind: 'RERANKER',
				metadata: { model: 'cohere/rerank-4-fast', topN: 8 },
				inputScore: undefined,
				topK: 3,
				outputScore: 0.95,
				output: {
					results: [
						{ documentId: matches[1].document.id, sourceTitle: '', score: 0.95, content: 'gamma' }
					]
				}
			});
		} finally {
			await provider.close();
		}
	});
});

describe('search query protocol', () => {
	const message = (text: string): StoredMessage => ({
		kind: 'readable',
		id: crypto.randomUUID() as Message['id'],
		conversationId: '00000000-0000-4000-8000-000000000051' as ConversationId,
		role: 'user',
		content: { text },
		createdAt: testNow
	});

	it('sends the condensation instructions and the transcript, and trims only whitespace', async () => {
		const provider = await inlineCompletionProvider(
			JSON.stringify({ choices: [{ message: { content: ' \n"deployment deadlines"  ' } }] })
		);
		try {
			const query = await retrieval(provider.baseURL).searchQuery('follow up', [
				message('a'),
				message('b')
			]);
			expect({ query, body: JSON.parse(provider.requests[0]!.body) }).toEqual({
				query: '"deployment deadlines"',
				body: {
					model: 'custom/query',
					messages: [
						{
							role: 'system',
							content:
								'Rewrite the following conversation into a single, focused search-query statement that captures what the user is currently trying to find or accomplish. Return only the statement — no preamble, no quotes.'
						},
						{ role: 'user', content: 'a\nb\nuser: follow up' }
					]
				}
			});
		} finally {
			await provider.close();
		}
	});

	it.each([
		{ name: 'no history', history: [] },
		{ name: 'a single turn', history: ['first'] }
	])('keeps the original query with $name, without a provider call', async ({ history }) => {
		const provider = await inlineCompletionProvider('{}');
		try {
			const query = await retrieval(provider.baseURL).searchQuery(
				'raw query',
				history.map(message)
			);
			expect({ query, requests: provider.requests }).toEqual({ query: 'raw query', requests: [] });
		} finally {
			await provider.close();
		}
	});
});

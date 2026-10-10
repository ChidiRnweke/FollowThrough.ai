import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { ExternalServiceError } from '$lib/errors';
import type { SearchMatch } from '$lib/models/knowledge-search';
import type { OperationObserver } from '$lib/server/adapters/telemetry/tracing';
import type { WorkflowTraceContext } from '$lib/models/telemetry';
import type { Attributes } from '@opentelemetry/api';
import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import { searchDocumentBuilder } from '$lib/testing/knowledge-search/fixtures/documents';
import { rerankProvider } from '$lib/testing/knowledge-search/fixtures/rerank-provider';
import { SearchRanking } from './ranking';

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

describe('OpenRouter rerank protocol', () => {
	it('sends the original query and exact structured documents with a capped result count', async () => {
		const provider = await rerankProvider('{"results":[]}');
		try {
			await new SearchRanking('synthetic-key', {
				baseURL: provider.baseURL,
				appURL: 'https://app.example.test'
			}).rerank('  recover?  ', matches.slice(0, 2), 8);
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
			const ranked = await new SearchRanking('synthetic-key', { baseURL: provider.baseURL }).rerank(
				'recover',
				matches,
				3
			);
			expect(ranked).toEqual([
				{ document: matches[2].document, score: 0.9 },
				{ document: matches[0].document, score: 0.8 },
				matches[1]
			]);
		} finally {
			await provider.close();
		}
	});

	it.each([
		{ name: 'HTTP failure', status: 503, body: '{}' },
		{ name: 'invalid JSON', status: 200, body: '{' },
		{ name: 'invalid result shape', status: 200, body: '{"results":[{"index":-1}]}' }
	])('reports $name as a provider error', async ({ status, body }) => {
		const provider = await rerankProvider(body, status);
		try {
			await expect(
				new SearchRanking('synthetic-key', { baseURL: provider.baseURL }).rerank(
					'recover',
					matches,
					2
				)
			).rejects.toBeInstanceOf(ExternalServiceError);
		} finally {
			await provider.close();
		}
	});

	it('returns empty input without a request or trace', async () => {
		const provider = await rerankProvider('{"results":[]}');
		const spans: string[] = [];
		const run: OperationObserver['run'] = async (name, _context, body) => {
			spans.push(name);
			return body();
		};
		try {
			const result = await new SearchRanking('synthetic-key', {
				baseURL: provider.baseURL,
				observer: { run }
			}).rerank('recover', [], 2);
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
			const pending = new SearchRanking('synthetic-key', {
				baseURL: `http://127.0.0.1:${address.port}`
			}).rerank('recover', matches, 2, controller.signal);
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
			await new SearchRanking('synthetic-key', {
				baseURL: provider.baseURL,
				observer: { run }
			}).rerank('recover', matches, 8);
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

	it('leaves the failed provider operation visible to its observer', async () => {
		const provider = await rerankProvider('{}', 503);
		const failures: { name: string; message: string }[] = [];
		const run: OperationObserver['run'] = async (name, _context, body) => {
			try {
				return await body();
			} catch (error) {
				failures.push({ name, message: error instanceof Error ? error.message : String(error) });
				throw error;
			}
		};
		try {
			const outcome = await new SearchRanking('synthetic-key', {
				baseURL: provider.baseURL,
				observer: { run }
			})
				.rerank('recover', matches, 2)
				.then(
					() => 'ranked',
					() => 'failed'
				);
			expect({ outcome, failures }).toEqual({
				outcome: 'failed',
				failures: [{ name: 'retrieval.rerank', message: 'Reranking failed' }]
			});
		} finally {
			await provider.close();
		}
	});
});

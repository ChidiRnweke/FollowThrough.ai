import OpenAI from 'openai';
import type { RerankEndpoint } from '$lib/models/knowledge-search';
import { z } from 'zod';

const embeddingRequestSchema = z.object({
	model: z.string(),
	input: z.array(z.string()),
	encoding_format: z.string().optional()
});
const rerankRequestSchema = z.object({
	query: z.string(),
	documents: z.array(z.string()),
	top_n: z.number()
});

/**
 * The embedding, chat-completion and rerank endpoints behind knowledge retrieval and tool
 * search, served in memory over `fetch` so the real provider client and parsing run.
 */
export class InMemoryRetrievalProvider {
	/** The embedding model this provider serves. */
	model = 'fake-embedding-v1';
	/** Embedding requests, in order: each is one provider batch. */
	readonly embeddingRequests: (readonly string[])[] = [];
	readonly rerankRequests: { readonly query: string; readonly documents: readonly string[] }[] = [];
	readonly vectorsByContent = new Map<string, readonly number[]>();
	embeddingFailure: Error | undefined;
	rejectedContents = new Set<string>();
	returnWrongCount = false;
	generation = 1;
	rerankOrder: 'input' | 'reverse' | 'relevant-first' = 'input';
	rerankFailure: Error | undefined;
	/** The rewritten search query, or `null` for a completion with no content. */
	queryRewrite: string | null = 'rewritten search query';
	/** Replaces the whole chat-completion response, for malformed or failed provider output. */
	completionResponse: { readonly body: object; readonly status: number } | undefined;
	readonly completionRequests: unknown[] = [];

	readonly fetch: typeof globalThis.fetch = async (input, init) => {
		const url = String(input instanceof Request ? input.url : input);
		const body: unknown = JSON.parse(String(init?.body ?? '{}'));
		if (url.endsWith('/embeddings')) {
			const request = embeddingRequestSchema.parse(body);
			return this.embed(request.input, request.encoding_format === 'base64');
		}
		if (url.endsWith('/rerank')) return this.rank(rerankRequestSchema.parse(body));
		if (url.endsWith('/chat/completions')) {
			this.completionRequests.push(body);
			if (this.completionResponse)
				return Response.json(this.completionResponse.body, {
					status: this.completionResponse.status
				});
			return Response.json({
				id: 'completion-1',
				object: 'chat.completion',
				created: 1,
				model: 'test-model',
				choices: [
					{
						index: 0,
						finish_reason: 'stop',
						logprobs: null,
						message: { role: 'assistant', content: this.queryRewrite, refusal: null }
					}
				]
			});
		}
		return new Response('not found', { status: 404 });
	};

	readonly client = new OpenAI({
		apiKey: 'test-key',
		baseURL: 'https://provider.test/v1',
		fetch: this.fetch,
		maxRetries: 0
	});

	readonly rerank: RerankEndpoint = {
		url: 'https://provider.test/v1/rerank',
		headers: {},
		fetch: this.fetch
	};

	private async embed(contents: readonly string[], base64: boolean): Promise<Response> {
		this.embeddingRequests.push(contents);
		if (this.embeddingFailure) throw this.embeddingFailure;
		if (contents.some((content) => this.rejectedContents.has(content)))
			throw new Error('Embedding rejected this content');
		const vectors = contents.map(
			(content, index) =>
				this.vectorsByContent.get(content) ?? [this.generation, index, content.length]
		);
		this.generation += 1;
		const returned = this.returnWrongCount ? vectors.slice(1) : vectors;
		return Response.json({
			object: 'list',
			model: this.model,
			usage: { prompt_tokens: 0, total_tokens: 0 },
			data: returned.map((embedding, index) => ({
				object: 'embedding',
				index,
				embedding: base64 ? encodeVector(embedding) : embedding
			}))
		});
	}

	private async rank(request: z.infer<typeof rerankRequestSchema>): Promise<Response> {
		this.rerankRequests.push({ query: request.query, documents: request.documents });
		if (this.rerankFailure) throw this.rerankFailure;
		const positions = request.documents.map((document, index) => ({ document, index }));
		if (this.rerankOrder === 'reverse') positions.reverse();
		if (this.rerankOrder === 'relevant-first')
			positions.sort(
				(left, right) =>
					Number(right.document.includes('relevant')) - Number(left.document.includes('relevant'))
			);
		return Response.json({
			results: positions
				.slice(0, request.top_n)
				.map(({ index }, rank) => ({ index, relevance_score: 1 - rank / 100 }))
		});
	}
}

/** The SDK requests base64 float32 vectors unless told otherwise, and decodes them itself. */
const encodeVector = (vector: readonly number[]): string =>
	Buffer.from(new Float32Array(vector).buffer).toString('base64');

/** The provider surfaces retrieval needs, over any transport. */
export type RetrievalProviderDouble = Pick<
	InMemoryRetrievalProvider,
	'client' | 'rerank' | 'model'
>;

/** Point the real provider client at a hand-written transport, e.g. one recording batch sizes. */
export const retrievalTransport = (
	fetch: typeof globalThis.fetch,
	model = 'fake-embedding-v1'
): RetrievalProviderDouble => ({
	model,
	client: new OpenAI({
		apiKey: 'test-key',
		baseURL: 'https://provider.test/v1',
		fetch,
		maxRetries: 0
	}),
	rerank: { url: 'https://provider.test/v1/rerank', headers: {}, fetch }
});

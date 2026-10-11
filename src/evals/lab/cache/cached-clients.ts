import {
	DEFAULT_RERANK_MODEL,
	RERANKING_STRATEGY,
	rerankResponseSchema,
	searchQueryCompletionSchema
} from '$lib/models/knowledge-search';
import { cachedSearchQuerySchema } from '$lib/models/knowledge-search/query-generation';
import { z } from 'zod';
import { DiskCache, decodeVector, encodeVector } from './disk-cache';

const embeddingRequestSchema = z.object({
	model: z.string(),
	input: z.array(z.string()),
	encoding_format: z.string().optional()
});
const embeddingResponseSchema = z.object({
	data: z.array(
		z.object({ index: z.number(), embedding: z.union([z.string(), z.array(z.number())]) })
	)
});
const rerankRequestSchema = z.object({
	query: z.string(),
	documents: z.array(z.string()),
	top_n: z.number()
});
const completionRequestSchema = z.looseObject({
	messages: z.array(z.object({ role: z.string(), content: z.string() }))
});

/** The cache key of one rerank request: its documents carry title, section and content. */
export const rerankerCacheKey = (
	query: string,
	documents: readonly string[],
	topN: number
): string =>
	DiskCache.key('rerank', {
		model: DEFAULT_RERANK_MODEL,
		strategy: RERANKING_STRATEGY,
		query,
		topN,
		documents
	});

/**
 * A recording transport for the auxiliary provider edges — embeddings, reranking and search-query
 * rewriting — keyed exactly as the cache file has always been keyed. Embeddings are cached one
 * input at a time, so a batch with one new string still replays the rest. Reranks cache candidate
 * positions rather than document ids, which eval workspaces regenerate on every run.
 */
export const cachedRetrievalFetch =
	(
		cache: DiskCache,
		inner: typeof globalThis.fetch = globalThis.fetch,
		isDeterministic: (content: string) => boolean = () => false
	): typeof globalThis.fetch =>
	async (input, init) => {
		const url = String(input instanceof Request ? input.url : input);
		const body: unknown = JSON.parse(String(init?.body ?? '{}'));
		const forward = (payload: object) =>
			inner(input, { ...init, body: JSON.stringify(payload) }).then(async (response) => {
				if (!response.ok) throw new Error(`Provider returned ${response.status}`);
				return response.json();
			});

		if (url.endsWith('/embeddings')) {
			const request = embeddingRequestSchema.parse(body);
			const vectors = await Promise.all(
				request.input.map((content) =>
					cache.resolve(
						DiskCache.key('embed', { model: request.model, content }),
						async () => {
							const response = embeddingResponseSchema.parse(
								await forward({ model: request.model, input: [content], encoding_format: 'float' })
							);
							const embedding = response.data[0]?.embedding;
							if (embedding === undefined) throw new Error('Provider returned no embedding');
							return typeof embedding === 'string' ? embedding : encodeVector(embedding);
						},
						{ deterministic: isDeterministic(content) }
					)
				)
			);
			return Response.json({
				object: 'list',
				model: request.model,
				usage: { prompt_tokens: 0, total_tokens: 0 },
				data: vectors.map((encoded, index) => ({
					object: 'embedding',
					index,
					embedding: request.encoding_format === 'base64' ? encoded : decodeVector(encoded)
				}))
			});
		}

		if (url.endsWith('/rerank')) {
			const request = rerankRequestSchema.parse(body);
			const order = await cache.resolve(
				rerankerCacheKey(request.query, request.documents, request.top_n),
				async () =>
					rerankResponseSchema.parse(await forward(request)).results.map((result) => result.index)
			);
			return Response.json({ results: order.map((index) => ({ index })) });
		}

		if (url.endsWith('/chat/completions')) {
			const request = completionRequestSchema.parse(body);
			const transcript = request.messages.find((message) => message.role === 'user')?.content;
			if (transcript === undefined) return inner(input, init);
			const query = cachedSearchQuerySchema.parse(
				await cache.resolve(DiskCache.key('search-query-v2', { text: transcript }), async () => {
					const completion = searchQueryCompletionSchema.parse(await forward(request));
					const text = completion.choices[0]?.message.content?.trim();
					if (!text) throw new Error('Search query generation returned no usable text');
					return text;
				})
			);
			return Response.json({ choices: [{ message: { role: 'assistant', content: query } }] });
		}

		return inner(input, init);
	};

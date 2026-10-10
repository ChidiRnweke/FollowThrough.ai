import type { SearchMatch } from '$lib/models/knowledge-search';
import type { Reranker } from '$lib/models/knowledge-search';
import type { EmbeddingBatch, EmbeddingClient } from '$lib/models/knowledge-search/embeddings';
import {
	cachedSearchQuerySchema,
	type SearchQueryCache
} from '$lib/models/knowledge-search/query-generation';
import {
	DEFAULT_RERANK_MODEL,
	RERANKING_STRATEGY,
	rerankDocumentText
} from '$lib/server/adapters/knowledge-search/rerank-protocol';
import { DiskCache, decodeVector, encodeVector } from './disk-cache';

export const rerankerCacheKey = (
	query: string,
	matches: readonly SearchMatch[],
	topN: number
): string =>
	DiskCache.key('rerank', {
		model: DEFAULT_RERANK_MODEL,
		strategy: RERANKING_STRATEGY,
		query,
		topN,
		documents: matches.map(rerankDocumentText)
	});

/**
 * Embeds one content string at a time so that a batch of five where one string
 * is new still replays the other four. Batching would key on the whole array
 * and miss whenever any member changed.
 */
export class CachedEmbeddingClient implements EmbeddingClient {
	readonly model: string;

	constructor(
		private readonly inner: EmbeddingClient,
		private readonly cache: DiskCache,
		private readonly isDeterministic: (content: string) => boolean = () => false
	) {
		this.model = inner.model;
	}

	async embed(contents: readonly string[]): Promise<EmbeddingBatch> {
		const vectors = await Promise.all(
			contents.map(async (content) => {
				const key = DiskCache.key('embed', { model: this.model, content });
				const encoded = await this.cache.resolve(
					key,
					async () => {
						const batch = await this.inner.embed([content]);
						return encodeVector(batch.vectors[0]);
					},
					{ deterministic: this.isDeterministic(content) }
				);
				return decodeVector(encoded);
			})
		);
		return { model: this.model, vectors };
	}
}

export class CachedReranker implements Reranker {
	constructor(
		private readonly inner: Reranker,
		private readonly cache: DiskCache
	) {}

	async rerank(
		query: string,
		matches: readonly SearchMatch[],
		topN: number
	): Promise<readonly SearchMatch[]> {
		// Cache input positions rather than generated document ids. Eval workspaces
		// get fresh ids on every run, while the ordered serialized documents in the
		// cache key remain stable and still invalidate when their content changes.
		const key = rerankerCacheKey(query, matches, topN);
		const order = await this.cache.resolve(key, async () => {
			const ranked = await this.inner.rerank(query, matches, topN);
			return ranked.map((rankedMatch) => {
				const index = matches.findIndex((match) => match.document.id === rankedMatch.document.id);
				if (index < 0) throw new Error('Reranker returned a document outside its candidate set');
				return index;
			});
		});
		return order
			.map((index) => matches[index])
			.filter((match): match is SearchMatch => match !== undefined);
	}
}

export class DiskSearchQueryCache implements SearchQueryCache {
	constructor(private readonly cache: DiskCache) {}

	async read(text: string): ReturnType<SearchQueryCache['read']> {
		const entry = await this.cache.lookup(DiskCache.key('search-query-v2', { text }));
		return entry.kind === 'hit'
			? { kind: 'hit', query: cachedSearchQuerySchema.parse(entry.value) }
			: { kind: 'miss' };
	}

	write(text: string, query: string): Promise<void> {
		return this.cache.store(DiskCache.key('search-query-v2', { text }), query);
	}
}

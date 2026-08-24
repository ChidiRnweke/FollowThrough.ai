import type { SearchMatch } from '$lib/models/knowledge-search';
import type {
	Condenser,
	EmbeddingBatch,
	EmbeddingClient,
	Reranker
} from '$lib/server/services/knowledge-search/contracts';
import {
	DEFAULT_RERANK_MODEL,
	RERANKING_STRATEGY,
	rerankDocumentText
} from '$lib/server/services/knowledge-search/ranking';
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

export class CachedCondenser implements Condenser {
	constructor(
		private readonly inner: Condenser,
		private readonly cache: DiskCache
	) {}

	condense(text: string): Promise<string> {
		return this.cache.resolve(DiskCache.key('condense', { text }), () => this.inner.condense(text));
	}
}

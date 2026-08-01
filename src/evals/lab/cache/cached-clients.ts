import type { SearchMatch } from '$lib/models/knowledge-search';
import type {
	Condenser,
	EmbeddingBatch,
	EmbeddingClient,
	Reranker
} from '$lib/server/services/knowledge-search/contracts';
import { DiskCache, decodeVector, encodeVector } from './disk-cache';

/**
 * Embeds one content string at a time so that a batch of five where one string
 * is new still replays the other four. Batching would key on the whole array
 * and miss whenever any member changed.
 */
export class CachedEmbeddingClient implements EmbeddingClient {
	readonly model: string;

	constructor(
		private readonly inner: EmbeddingClient,
		private readonly cache: DiskCache
	) {
		this.model = inner.model;
	}

	async embed(contents: readonly string[]): Promise<EmbeddingBatch> {
		const vectors = await Promise.all(
			contents.map(async (content) => {
				const key = DiskCache.key('embed', { model: this.model, content });
				const encoded = await this.cache.resolve(key, async () => {
					const batch = await this.inner.embed([content]);
					return encodeVector(batch.vectors[0]);
				});
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
		// Cache the resulting order, not the matches themselves — the documents
		// come back from the database and rehydrate from the ids on replay.
		const key = DiskCache.key('rerank', {
			query,
			topN,
			ids: matches.map((match) => match.document.id)
		});
		const order = await this.cache.resolve(key, async () => {
			const ranked = await this.inner.rerank(query, matches, topN);
			return ranked.map((match) => match.document.id);
		});
		const byId = new Map(matches.map((match) => [match.document.id, match]));
		return order
			.map((id) => byId.get(id))
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

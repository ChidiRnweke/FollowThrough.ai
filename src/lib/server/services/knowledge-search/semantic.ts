import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { SearchMatch } from '$lib/models/knowledge-search';
import { InvalidGeneratedContentError } from '$lib/errors';
import type { RetrievalIndexRepository } from '$lib/server/repositories/knowledge-search';
import type { SearchFilter } from '$lib/server/repositories/knowledge-search';
interface EmbeddingClient {
	readonly model: string;
	embed(
		contents: readonly string[],
		signal?: AbortSignal
	): Promise<{ readonly model: string; readonly vectors: readonly (readonly number[])[] }>;
}
export interface KnowledgeSearcher {
	search(
		actor: ActorContext,
		query: string,
		limit?: number,
		projectId?: ProjectId,
		signal?: AbortSignal,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]>;
}
export interface Reranker {
	rerank(
		query: string,
		matches: readonly SearchMatch[],
		topN: number,
		signal?: AbortSignal
	): Promise<readonly SearchMatch[]>;
}

export class EmbeddedKnowledgeSearcher implements KnowledgeSearcher {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient
	) {}

	async search(
		actor: ActorContext,
		query: string,
		limit = 10,
		projectId?: ProjectId,
		signal?: AbortSignal,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]> {
		if (!query.trim()) return [];
		const batch = await this.embeddingClient.embed([query], signal);
		const embedding = batch.vectors[0];
		if (!embedding || batch.vectors.length !== 1)
			throw new InvalidGeneratedContentError('Query embedding returned an invalid result');
		return this.repository.searchByEmbedding(actor, embedding, limit, projectId, filter);
	}
}

/**
 * Wraps a knowledge searcher with a reranking stage: retrieve a wide candidate
 * set from the cheap vector search, then shrink it to `limit` with the reranker.
 */
export class RerankingKnowledgeSearcher implements KnowledgeSearcher {
	constructor(
		private readonly inner: KnowledgeSearcher,
		private readonly reranker: Reranker,
		private readonly candidateMultiplier = 5,
		private readonly minCandidates = 40
	) {}

	async search(
		actor: ActorContext,
		query: string,
		limit = 10,
		projectId?: ProjectId,
		signal?: AbortSignal,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]> {
		if (!query.trim()) return [];
		const wideLimit = Math.max(this.minCandidates, limit * this.candidateMultiplier);
		const candidates = await this.inner.search(actor, query, wideLimit, projectId, signal, filter);
		if (candidates.length <= 1) return candidates;
		try {
			return await this.reranker.rerank(query, candidates, limit, signal);
		} catch (error) {
			if (signal?.aborted) throw error;
			return candidates.slice(0, limit);
		}
	}
}

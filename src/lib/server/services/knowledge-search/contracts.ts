import type { SearchMatch } from '$lib/models/knowledge-search';
import type { EmbeddingBatch } from '$lib/models/knowledge-search/embeddings';
export type { EmbeddingBatch } from '$lib/models/knowledge-search/embeddings';
export interface ContentChunker {
	chunk(content: string): readonly string[];
}
export interface EmbeddingClient {
	readonly model: string;
	embed(contents: readonly string[], signal?: AbortSignal): Promise<EmbeddingBatch>;
}
export interface Reranker {
	rerank(
		query: string,
		matches: readonly SearchMatch[],
		topN: number,
		signal?: AbortSignal
	): Promise<readonly SearchMatch[]>;
}

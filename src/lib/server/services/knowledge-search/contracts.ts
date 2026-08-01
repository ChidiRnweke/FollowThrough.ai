import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { SearchMatch } from '$lib/models/knowledge-search';
import type { CreatedRange } from '$lib/server/repositories/knowledge-search';

export interface KnowledgeSearcher {
	search(
		actor: ActorContext,
		query: string,
		limit?: number,
		projectId?: ProjectId,
		signal?: AbortSignal,
		created?: CreatedRange
	): Promise<readonly SearchMatch[]>;
}
export interface ContentChunker {
	chunk(content: string): readonly string[];
}
export interface EmbeddingBatch {
	readonly model: string;
	readonly vectors: readonly (readonly number[])[];
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
export interface Condenser {
	condense(text: string): Promise<string>;
}

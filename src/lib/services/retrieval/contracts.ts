import type { ActorContext, ProjectId, SearchMatch } from '$lib/models';

export interface KnowledgeSearcher {
	search(
		actor: ActorContext,
		query: string,
		limit?: number,
		projectId?: ProjectId
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
	embed(contents: readonly string[]): Promise<EmbeddingBatch>;
}

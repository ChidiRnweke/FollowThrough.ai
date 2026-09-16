import type { StoredToolEmbedding, ToolEmbeddingWrite } from '$lib/models/agent/tool-index';
export type { StoredToolEmbedding, ToolEmbeddingWrite } from '$lib/models/agent/tool-index';

export interface ToolEmbeddingRepository {
	/** Everything currently seeded, for drift detection. */
	list(): Promise<readonly StoredToolEmbedding[]>;
	upsert(rows: readonly ToolEmbeddingWrite[]): Promise<void>;
	/** Drops rows for tools that left the catalog. */
	deleteExcept(names: readonly string[]): Promise<void>;
	/**
	 * Ranks the given tool names by cosine distance to the query vector, ascending.
	 * Names without a stored vector simply do not appear — seeding is the fix, not a
	 * runtime fallback.
	 */
	rankByVector(
		queryVector: readonly number[],
		names: readonly string[],
		limit: number,
		model: string
	): Promise<string[]>;
}

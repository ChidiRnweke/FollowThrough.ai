/** One stored tool-catalog vector, minus the vector itself (never read back out). */
export interface StoredToolEmbedding {
	readonly name: string;
	readonly description: string;
	readonly contentHash: string;
	readonly embeddingModel: string;
}

/** A catalog entry with its freshly computed vector, written by the deploy seeder. */
export interface ToolEmbeddingWrite extends StoredToolEmbedding {
	readonly embedding: readonly number[];
}

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
		limit: number
	): Promise<string[]>;
}

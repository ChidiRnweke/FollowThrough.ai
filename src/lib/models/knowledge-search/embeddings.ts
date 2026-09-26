/** Vectors returned for one ordered batch of source texts. */
export interface EmbeddingBatch {
	readonly model: string;
	readonly vectors: readonly (readonly number[])[];
}

/** Existing provider request budget; batching never discards source text. */
export const EMBEDDING_BATCH_TOKENS = 30_000;

/** Vectors returned for one ordered batch of source texts. */
export interface EmbeddingBatch {
	readonly model: string;
	readonly vectors: readonly (readonly number[])[];
}

/** Existing provider request budget; batching never discards source text. */
export const EMBEDDING_BATCH_TOKENS = 30_000;

export interface EmbeddingClient {
	readonly model: string;
	embed(contents: readonly string[], signal?: AbortSignal): Promise<EmbeddingBatch>;
}

/** Stored search vectors use this model's 3072 dimensions. */
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-large';

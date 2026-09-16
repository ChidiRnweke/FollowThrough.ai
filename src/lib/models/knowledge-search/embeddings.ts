/** Vectors returned for one ordered batch of source texts. */
export interface EmbeddingBatch {
	readonly model: string;
	readonly vectors: readonly (readonly number[])[];
}

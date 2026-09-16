export interface ToolDescriptor {
	readonly name: string;
	readonly description: string;
	readonly retrievalText?: string;
}

export interface StoredToolEmbedding {
	readonly name: string;
	readonly description: string;
	readonly contentHash: string;
	readonly embeddingModel: string;
}

export interface ToolEmbeddingWrite extends StoredToolEmbedding {
	readonly embedding: readonly number[];
}

export interface ToolIndexPlan {
	readonly names: readonly string[];
	readonly model: string;
	readonly pending: readonly {
		readonly name: string;
		readonly description: string;
		readonly contentHash: string;
		readonly input: string;
	}[];
	readonly removed: number;
}

export interface ToolEmbeddingSeedSummary {
	readonly embedded: number;
	readonly unchanged: number;
	readonly removed: number;
}

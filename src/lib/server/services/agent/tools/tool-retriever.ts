interface EmbeddingsPort {
	embed(contents: readonly string[]): Promise<{
		readonly vectors: readonly (readonly number[])[];
	}>;
}

/** The subset of the tool-embedding store the retriever ranks against. */
export interface ToolEmbeddingRanker {
	rankByVector(
		queryVector: readonly number[],
		names: readonly string[],
		limit: number
	): Promise<string[]>;
}

/**
 * Retrieves the agent tools most relevant to a query by embedding each tool's
 * name + description once (cached across runs) and ranking with cosine
 * similarity. Cheap and in-process — one query embedding per call, no per-turn
 * network rerank.
 */

export interface ToolDescriptor {
	readonly name: string;
	readonly description: string;
}

export interface ToolRetriever {
	retrieve(catalog: readonly ToolDescriptor[], query: string, topN: number): Promise<string[]>;
}

const cosine = (a: readonly number[], b: readonly number[]): number => {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!;
		normA += a[i]! * a[i]!;
		normB += b[i]! * b[i]!;
	}
	const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
	return magnitude === 0 ? 0 : dot / magnitude;
};

export class EmbeddedToolRetriever implements ToolRetriever {
	private readonly vectors = new Map<string, readonly number[]>();

	constructor(private readonly embeddingClient: EmbeddingsPort) {}

	async retrieve(
		catalog: readonly ToolDescriptor[],
		query: string,
		topN: number
	): Promise<string[]> {
		if (catalog.length === 0) return [];
		await this.index(catalog);
		const [queryVector] = (await this.embeddingClient.embed([query])).vectors;
		if (!queryVector) return [];
		return catalog
			.map((tool) => ({
				name: tool.name,
				score: cosine(queryVector, this.vectors.get(tool.name)!)
			}))
			.sort((a, b) => b.score - a.score)
			.slice(0, topN)
			.map((entry) => entry.name);
	}

	private async index(catalog: readonly ToolDescriptor[]): Promise<void> {
		const missing = catalog.filter((tool) => !this.vectors.has(tool.name));
		if (missing.length === 0) return;
		const batch = await this.embeddingClient.embed(
			missing.map((tool) => `${tool.name}: ${tool.description}`)
		);
		missing.forEach((tool, index) => {
			const vector = batch.vectors[index];
			if (vector) this.vectors.set(tool.name, vector);
		});
	}
}

/**
 * Production retriever: tool description vectors live in the `tool_embeddings`
 * table, seeded at deploy time next to migrations (see `src/seed-tool-embeddings.ts`).
 * Runtime work per call is one query embedding plus a SQL cosine-distance ordering;
 * tools without a stored vector are unrankable until the next seed.
 */
export class PgToolRetriever implements ToolRetriever {
	constructor(
		private readonly embeddingClient: EmbeddingsPort,
		private readonly embeddings: ToolEmbeddingRanker
	) {}

	async retrieve(
		catalog: readonly ToolDescriptor[],
		query: string,
		topN: number
	): Promise<string[]> {
		if (catalog.length === 0) return [];
		const [queryVector] = (await this.embeddingClient.embed([query])).vectors;
		if (!queryVector) return [];
		const names = catalog.map((tool) => tool.name);
		// Rank the whole catalog so tools missing from the table can be named in the
		// warning; the caller-visible result is still capped at topN.
		const ranked = await this.embeddings.rankByVector(queryVector, names, names.length);
		if (ranked.length < names.length) {
			const stored = new Set(ranked);
			console.warn(
				`[tool-retriever] no stored embedding for: ${names.filter((name) => !stored.has(name)).join(', ')} — run the tool-embedding seed`
			);
		}
		return ranked.slice(0, topN);
	}
}

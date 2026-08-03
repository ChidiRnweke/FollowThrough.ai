import type {
	StoredToolEmbedding,
	ToolEmbeddingRepository,
	ToolEmbeddingWrite
} from '$lib/server/repositories/agent/tool-embeddings';
import type { ToolEmbeddingEmbedder } from '$lib/server/services/agent/tools/tool-embedding-seed';

/**
 * Records every embed request. Returns one fixed vector per input unless
 * `vectors` is overridden (e.g. emptied to simulate a short batch).
 */
export class RecordingEmbeddings implements ToolEmbeddingEmbedder {
	readonly requests: string[][] = [];
	vectors: readonly (readonly number[])[] | undefined;

	constructor(readonly model: string = 'test-model') {}

	async embed(contents: readonly string[]): Promise<{
		readonly model: string;
		readonly vectors: readonly (readonly number[])[];
	}> {
		this.requests.push([...contents]);
		return { model: this.model, vectors: this.vectors ?? contents.map(() => [0, 1]) };
	}
}

/** Map-backed tool-embedding store; ranking is pre-set by the test. */
export class InMemoryToolEmbeddingRepository implements ToolEmbeddingRepository {
	readonly rows = new Map<string, ToolEmbeddingWrite>();
	readonly rankings: { readonly names: readonly string[]; readonly limit: number }[] = [];
	ranked: string[] = [];

	constructor(stored: readonly ToolEmbeddingWrite[] = []) {
		for (const row of stored) this.rows.set(row.name, row);
	}

	async list(): Promise<readonly StoredToolEmbedding[]> {
		return [...this.rows.values()].map(({ embedding: _embedding, ...row }) => row);
	}

	async upsert(writes: readonly ToolEmbeddingWrite[]): Promise<void> {
		for (const write of writes) this.rows.set(write.name, write);
	}

	async deleteExcept(names: readonly string[]): Promise<void> {
		const keep = new Set(names);
		for (const name of [...this.rows.keys()]) if (!keep.has(name)) this.rows.delete(name);
	}

	async rankByVector(
		_queryVector: readonly number[],
		names: readonly string[],
		limit: number
	): Promise<string[]> {
		this.rankings.push({ names, limit });
		return this.ranked.slice(0, limit);
	}
}

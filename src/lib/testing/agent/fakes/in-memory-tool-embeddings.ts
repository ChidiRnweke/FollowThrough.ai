import type { StoredToolEmbedding, ToolEmbeddingWrite } from '$lib/models/agent/tool-index';
import type { ToolEmbeddingRepository } from '$lib/server/repositories/agent/tool-embeddings';
import type { IEmbeddings } from '$lib/server/services/knowledge-search/embeddings';
import type {
	SnapshotParticipant,
	RestoreSnapshot
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export class InMemoryToolEmbeddings implements IEmbeddings {
	vectors: readonly (readonly number[])[] | undefined;
	failure?: Error;
	constructor(readonly model = 'test-model') {}
	async embed(contents: readonly string[]) {
		if (this.failure) throw this.failure;
		return { model: this.model, vectors: this.vectors ?? contents.map(() => [0, 1]) };
	}
}

export class InMemoryToolEmbeddingRepository
	implements ToolEmbeddingRepository, SnapshotParticipant
{
	readonly rows = new Map<string, ToolEmbeddingWrite>();
	pruneFailure?: Error;
	constructor(stored: readonly ToolEmbeddingWrite[] = []) {
		for (const row of stored) this.rows.set(row.name, row);
	}
	snapshot(): RestoreSnapshot {
		const rows = structuredClone([...this.rows]);
		return () => {
			this.rows.clear();
			for (const [name, row] of rows) this.rows.set(name, row);
		};
	}
	async list(): Promise<readonly StoredToolEmbedding[]> {
		return [...this.rows.values()].map(({ embedding: _embedding, ...row }) => row);
	}
	async upsert(writes: readonly ToolEmbeddingWrite[]): Promise<void> {
		for (const write of writes) this.rows.set(write.name, write);
	}
	async deleteExcept(names: readonly string[]): Promise<void> {
		if (this.pruneFailure) throw this.pruneFailure;
		const keep = new Set(names);
		for (const name of this.rows.keys()) if (!keep.has(name)) this.rows.delete(name);
	}
	async rankByVector(
		query: readonly number[],
		names: readonly string[],
		limit: number,
		model: string
	): Promise<string[]> {
		const wanted = new Set(names);
		return [...this.rows.values()]
			.filter((row) => wanted.has(row.name) && row.embeddingModel === model)
			.map((row) => ({ name: row.name, score: cosine(query, row.embedding) }))
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((row) => row.name);
	}
}

const cosine = (left: readonly number[], right: readonly number[]) => {
	if (left.length !== right.length) throw new Error('Embedding dimensions differ');
	const dot = left.reduce((sum, value, index) => sum + value * right[index]!, 0);
	const norm =
		Math.sqrt(left.reduce((sum, value) => sum + value * value, 0)) *
		Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
	return norm === 0 ? 0 : dot / norm;
};

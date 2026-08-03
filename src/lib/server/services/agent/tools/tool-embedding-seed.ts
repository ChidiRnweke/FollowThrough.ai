import { createHash } from 'node:crypto';
import type {
	ToolEmbeddingRepository,
	ToolEmbeddingWrite
} from '$lib/server/repositories/agent/tool-embeddings';
import { TOOL_CATALOG, type ToolCatalogEntry } from '$lib/models/agent/tool-catalog';

/**
 * The embedder the seeder needs: the shared knowledge-search client satisfies
 * this structurally. Declared locally because services do not import services.
 */
export interface ToolEmbeddingEmbedder {
	readonly model: string;
	embed(contents: readonly string[]): Promise<{
		readonly model: string;
		readonly vectors: readonly (readonly number[])[];
	}>;
}

export interface ToolEmbeddingSeedSummary {
	readonly embedded: number;
	readonly unchanged: number;
	readonly removed: number;
}

/** The embedded text is `"${name}: ${description}"` — same shape the query side ranks against. */
export const toolEmbeddingText = (entry: ToolCatalogEntry): string =>
	`${entry.name}: ${entry.description}`;

export const toolContentHash = (entry: ToolCatalogEntry): string =>
	createHash('sha256').update(toolEmbeddingText(entry)).digest('hex');

/**
 * Brings the `tool_embeddings` table in line with the static tool catalog:
 * embeds entries that are new, whose description drifted, or whose stored model
 * differs from the active one, and drops rows for tools that left the catalog.
 * Idempotent — runs on every deploy, next to migrations.
 */
export const seedToolEmbeddings = async (
	repository: ToolEmbeddingRepository,
	embeddings: ToolEmbeddingEmbedder,
	catalog: readonly ToolCatalogEntry[] = TOOL_CATALOG
): Promise<ToolEmbeddingSeedSummary> => {
	const existing = new Map((await repository.list()).map((row) => [row.name, row]));
	const stale = catalog.filter((entry) => {
		const row = existing.get(entry.name);
		return (
			!row || row.contentHash !== toolContentHash(entry) || row.embeddingModel !== embeddings.model
		);
	});

	if (stale.length > 0) {
		const batch = await embeddings.embed(stale.map(toolEmbeddingText));
		const writes: ToolEmbeddingWrite[] = stale.map((entry, index) => {
			const vector = batch.vectors[index];
			if (!vector)
				throw new Error(`Embedding batch returned no vector at index ${index} for ${entry.name}`);
			return {
				...entry,
				contentHash: toolContentHash(entry),
				embedding: vector,
				embeddingModel: batch.model
			};
		});
		await repository.upsert(writes);
	}

	const names = new Set(catalog.map((entry) => entry.name));
	const removed = [...existing.keys()].filter((name) => !names.has(name));
	await repository.deleteExcept([...names]);

	return {
		embedded: stale.length,
		unchanged: catalog.length - stale.length,
		removed: removed.length
	};
};

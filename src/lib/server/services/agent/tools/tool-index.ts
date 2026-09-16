import { createHash } from 'node:crypto';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
import type {
	ToolDescriptor,
	ToolIndexPlan,
	ToolEmbeddingSeedSummary
} from '$lib/models/agent/tool-index';
import type { EmbeddingBatch } from '$lib/models/knowledge-search/embeddings';
import type { ToolEmbeddingRepository } from '$lib/server/repositories/agent/tool-embeddings';

export const toolEmbeddingText = (entry: ToolDescriptor): string =>
	`${entry.name}: ${entry.retrievalText ?? entry.description}`;

export const toolContentHash = (entry: ToolDescriptor): string =>
	createHash('sha256').update(toolEmbeddingText(entry)).digest('hex');

/** Stored tool vectors and catalog drift; no provider calls. */
export class ToolCatalogIndex {
	constructor(private readonly repository: ToolEmbeddingRepository) {}

	async prepare(catalog: readonly ToolDescriptor[], model: string): Promise<ToolIndexPlan> {
		const existing = new Map((await this.repository.list()).map((row) => [row.name, row]));
		const names = catalog.map((entry) => entry.name);
		const desired = new Set(names);
		const pending = catalog
			.filter((entry) => {
				const stored = existing.get(entry.name);
				return (
					!stored ||
					stored.contentHash !== toolContentHash(entry) ||
					stored.embeddingModel !== model
				);
			})
			.map((entry) => ({
				name: entry.name,
				description: entry.description,
				contentHash: toolContentHash(entry),
				input: toolEmbeddingText(entry)
			}));
		return {
			names,
			model,
			pending,
			removed: [...existing.keys()].filter((name) => !desired.has(name)).length
		};
	}

	async complete(plan: ToolIndexPlan, batch: EmbeddingBatch): Promise<ToolEmbeddingSeedSummary> {
		if (batch.model !== plan.model || batch.vectors.length !== plan.pending.length)
			throw new InvalidGeneratedContentError(
				'Tool embedding results did not match the prepared catalog'
			);
		await this.repository.upsert(
			plan.pending.map((entry, index) => ({
				name: entry.name,
				description: entry.description,
				contentHash: entry.contentHash,
				embeddingModel: batch.model,
				embedding: batch.vectors[index]!
			}))
		);
		await this.repository.deleteExcept(plan.names);
		return {
			embedded: plan.pending.length,
			unchanged: plan.names.length - plan.pending.length,
			removed: plan.removed
		};
	}

	async rank(
		names: readonly string[],
		vector: readonly number[],
		model: string,
		limit: number
	): Promise<string[]> {
		const ranked = await this.repository.rankByVector(vector, names, names.length, model);
		const available = new Set(ranked);
		const missing = names.filter((name) => !available.has(name));
		if (missing.length)
			throw new ExternalServiceError(
				'Tool search index is incomplete. Run the tool-embedding seed.',
				{ cause: 'Missing current-model vectors for: ' + missing.join(', ') }
			);
		return ranked.slice(0, limit);
	}
}

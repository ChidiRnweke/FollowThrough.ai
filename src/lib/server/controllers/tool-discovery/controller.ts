import { InvalidGeneratedContentError } from '$lib/errors';
import type { ToolDescriptor, ToolEmbeddingSeedSummary } from '$lib/models/agent/tool-index';
import { TOOL_CATALOG } from '$lib/models/agent/tool-catalog';
import type { ToolCatalogIndex } from '$lib/server/services/agent/tools/tool-index';
import type { IEmbeddings } from '$lib/server/services/knowledge-search/embeddings';

export interface ToolRetriever {
	retrieve(catalog: readonly ToolDescriptor[], query: string, topN: number): Promise<string[]>;
}

interface TransactionRunner {
	run<T>(work: () => Promise<T>): Promise<T>;
}

export class ToolDiscovery implements ToolRetriever {
	constructor(
		private readonly index: ToolCatalogIndex,
		private readonly embeddings: IEmbeddings,
		private readonly transactions: TransactionRunner
	) {}

	async retrieve(
		catalog: readonly ToolDescriptor[],
		query: string,
		topN: number
	): Promise<string[]> {
		if (!catalog.length) return [];
		const batch = await this.embeddings.embed([query]);
		const vector = batch.vectors[0];
		if (batch.vectors.length !== 1 || !vector)
			throw new InvalidGeneratedContentError('Tool search requires one query embedding');
		return this.index.rank(
			catalog.map((tool) => tool.name),
			vector,
			batch.model,
			topN
		);
	}

	async seed(catalog: readonly ToolDescriptor[] = TOOL_CATALOG): Promise<ToolEmbeddingSeedSummary> {
		const plan = await this.index.prepare(catalog, this.embeddings.model);
		const batch = plan.pending.length
			? await this.embeddings.embed(plan.pending.map((entry) => entry.input))
			: { model: plan.model, vectors: [] };
		return this.transactions.run(() => this.index.complete(plan, batch));
	}
}
